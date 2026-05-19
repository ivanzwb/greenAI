import type { FastifyPluginAsync } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  CareTaskStatus,
  CareTaskType,
  LightLevel,
  SoilMoistureHint,
  WaterPreference,
} from "@prisma/client";
import {
  applyWeatherToIntervalDays,
  computeFertilizeIntervalDays,
  computeWaterIntervalDays,
  generateFertilizeTasks,
  generateWaterTasks,
  INSPECT_PERIOD_DAYS,
  nextPeriodicDueDate,
  REPOT_PERIOD_DAYS,
} from "../domain/careEngine.js";
import { loadConfig, isBaiduPlantIdentifyConfigured, resolveDiagnoseLlmSettings } from "../config.js";
import { authenticate } from "../lib/authGuard.js";
import { buildPlantEnv } from "../lib/plantCareContext.js";
import { fetchUserWeatherSnapshot } from "../lib/userWeather.js";
import {
  extractTaxonFamilyFromText,
  identifyPlantWithBaidu,
} from "../services/baiduPlantIdentify.js";
import { findOrCreateSpeciesProfile } from "../services/speciesProfileService.js";

const createBody = z.object({
  nickname: z.string().min(1),
  speciesLabel: z.string().min(1),
  waterPreference: z.nativeEnum(WaterPreference),
  indoor: z.boolean(),
  heating: z.boolean(),
  lightLevel: z.nativeEnum(LightLevel),
  soilMoistureHint: z.nativeEnum(SoilMoistureHint).optional(),
  taxonFamily: z.string().max(120).optional(),
  careDifficulty: z.string().max(40).optional(),
  waterAmountMl: z.number().int().min(0).max(100_000).optional(),
  fertilizerType: z.string().max(200).optional(),
  careTips: z.string().max(4000).optional(),
});

const patchBody = createBody.partial().extend({
  soilMoistureHint: z.nativeEnum(SoilMoistureHint).nullable().optional(),
  taxonFamily: z.string().max(120).nullable().optional(),
  careDifficulty: z.string().max(40).nullable().optional(),
  fertilizerType: z.string().max(200).nullable().optional(),
  careTips: z.string().max(4000).nullable().optional(),
  waterAmountMl: z.number().int().min(0).max(100_000).nullable().optional(),
});

const identifyBody = z.object({
  imageBase64: z.string().min(50).max(8_000_000),
});

const plantsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", authenticate);

  app.get("/plants/:id/soil-records", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const plant = await app.prisma.plant.findFirst({
      where: { id, userId: req.userId! },
      select: { id: true },
    });
    if (!plant) return reply.status(404).send({ error: "not_found" });
    return app.prisma.soilRecord.findMany({
      where: { plantId: id },
      orderBy: { createdAt: "desc" },
      take: 40,
    });
  });

  app.get("/plants/:id/tasks", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const plant = await app.prisma.plant.findFirst({
      where: { id, userId: req.userId! },
    });
    if (!plant) return reply.status(404).send({ error: "not_found" });
    const q = req.query as { status?: string };
    const where: Prisma.CareTaskWhereInput = { plantId: id };
    if (q.status === "pending") {
      where.status = CareTaskStatus.pending;
    } else if (q.status === "history") {
      where.status = {
        in: [CareTaskStatus.completed, CareTaskStatus.skipped],
      };
    }
    return app.prisma.careTask.findMany({
      where,
      orderBy: { dueDate: "asc" },
      take: 100,
    });
  });

  app.post("/plants/identify", async (req, reply) => {
    const config = loadConfig();
    if (!isBaiduPlantIdentifyConfigured(config)) {
      return reply.status(503).send({ error: "plant_identify_disabled" });
    }
    const parsed = identifyBody.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid_body" });
    try {
      const candidates = await identifyPlantWithBaidu({
        apiKey: config.BAIDU_API_KEY,
        secretKey: config.BAIDU_SECRET_KEY,
        imageBase64: parsed.data.imageBase64,
      });
      const filtered = candidates.filter((c) => c.name !== "非植物");
      if (!filtered.length) {
        return reply.status(422).send({ error: "no_plant_recognized" });
      }
      const best = { ...filtered[0] };
      if (!best.taxonFamily && best.baikeDescription) {
        const t = extractTaxonFamilyFromText(best.baikeDescription);
        if (t) best.taxonFamily = t;
      }
      const llm = resolveDiagnoseLlmSettings(config);
      const { profile, source } = await findOrCreateSpeciesProfile(
        app.prisma,
        {
          displayName: best.name,
          taxonFamilyHint: best.taxonFamily,
          baikeDescription: best.baikeDescription,
        },
        llm
      );
      req.log.info(
        { speciesProfileSource: source, hasProfile: Boolean(profile) },
        "species_profile_resolve"
      );
      const bestOut = {
        ...best,
        taxonFamily: best.taxonFamily ?? profile?.taxonFamily ?? undefined,
        ...(profile?.careDifficulty
          ? { careDifficulty: profile.careDifficulty }
          : {}),
        ...(profile?.careSummary ? { careSummary: profile.careSummary } : {}),
      };
      return {
        best: bestOut,
        candidates: filtered,
        speciesProfile: profile,
        speciesProfileSource: source,
      };
    } catch (e) {
      req.log.warn({ err: String(e) }, "plant_identify_failed");
      return reply.status(502).send({ error: "plant_identify_upstream" });
    }
  });

  app.get("/plants/:id", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    req.log = req.log.child({ plantId: id });
    const plant = await app.prisma.plant.findFirst({
      where: { id, userId: req.userId! },
    });
    if (!plant) return reply.status(404).send({ error: "not_found" });
    return plant;
  });

  app.get("/plants", async (req) => {
    return app.prisma.plant.findMany({
      where: { userId: req.userId! },
      orderBy: { createdAt: "desc" },
    });
  });

  app.post("/plants", async (req, reply) => {
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid_body" });

    const t0 = Date.now();
    const p = parsed.data;

    const user = await app.prisma.user.findUniqueOrThrow({
      where: { id: req.userId! },
      select: { airConditioning: true, windowAspect: true },
    });

    const baseInterval = computeWaterIntervalDays(
      p.waterPreference,
      buildPlantEnv(
        {
          indoor: p.indoor,
          heating: p.heating,
          lightLevel: p.lightLevel,
          soilMoistureHint: p.soilMoistureHint ?? null,
          waterSkipStreak: 0,
        },
        user
      )
    );
    const weather = await fetchUserWeatherSnapshot(app.prisma, req.userId!);
    const interval = applyWeatherToIntervalDays(baseInterval, weather);

    const plant = await app.prisma.plant.create({
      data: {
        userId: req.userId!,
        nickname: p.nickname,
        speciesLabel: p.speciesLabel,
        waterPreference: p.waterPreference,
        indoor: p.indoor,
        heating: p.heating,
        lightLevel: p.lightLevel,
        soilMoistureHint: p.soilMoistureHint,
        taxonFamily: p.taxonFamily,
        careDifficulty: p.careDifficulty,
        waterAmountMl: p.waterAmountMl,
        fertilizerType: p.fertilizerType,
        careTips: p.careTips,
        carePlan: {
          create: { baseIntervalDays: interval, horizonDays: 14 },
        },
      },
    });

    req.log = req.log.child({ plantId: plant.id });

    const asOf = new Date();
    const generated = generateWaterTasks({
      asOf,
      intervalDays: interval,
      horizonDays: 14,
      plantId: plant.id,
    });
    const fertInterval = computeFertilizeIntervalDays(interval);
    const generatedFert = generateFertilizeTasks({
      asOf,
      intervalDays: fertInterval,
      horizonDays: 14,
      plantId: plant.id,
    });

    const repotDue = nextPeriodicDueDate(
      plant.createdAt,
      REPOT_PERIOD_DAYS,
      asOf
    );
    const inspectDue = nextPeriodicDueDate(
      plant.createdAt,
      INSPECT_PERIOD_DAYS,
      asOf
    );

    await app.prisma.careTask.createMany({
      data: [
        ...generated.map((g) => ({
          plantId: g.plantId,
          type: CareTaskType.water,
          dueDate: g.dueDate,
          status: CareTaskStatus.pending,
        })),
        ...generatedFert.map((g) => ({
          plantId: g.plantId,
          type: CareTaskType.fertilize,
          dueDate: g.dueDate,
          status: CareTaskStatus.pending,
        })),
        {
          plantId: plant.id,
          type: CareTaskType.repot,
          dueDate: repotDue,
          status: CareTaskStatus.pending,
        },
        {
          plantId: plant.id,
          type: CareTaskType.inspect,
          dueDate: inspectDue,
          status: CareTaskStatus.pending,
        },
      ],
    });

    req.log.info(
      { planInitMs: Date.now() - t0, horizonDays: 14 },
      "plant_created_with_plan"
    );

    return plant;
  });

  app.patch("/plants/:id", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const parsed = patchBody.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid_body" });

    const plant = await app.prisma.plant.findFirst({
      where: { id, userId: req.userId! },
    });
    if (!plant) return reply.status(404).send({ error: "not_found" });

    req.log = req.log.child({ plantId: id });

    const updated = await app.prisma.plant.update({
      where: { id },
      data: parsed.data,
    });
    return updated;
  });

  app.delete("/plants/:id", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const plant = await app.prisma.plant.findFirst({
      where: { id, userId: req.userId! },
    });
    if (!plant) return reply.status(404).send({ error: "not_found" });
    req.log = req.log.child({ plantId: id });
    await app.prisma.plant.delete({ where: { id } });
    return reply.status(204).send();
  });

  app.post("/plants/:id/plan/regenerate", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const plant = await app.prisma.plant.findFirst({
      where: { id, userId: req.userId! },
      include: { carePlan: true },
    });
    if (!plant || !plant.carePlan)
      return reply.status(404).send({ error: "not_found" });

    req.log = req.log.child({ plantId: id });
    const t0 = Date.now();

    const user = await app.prisma.user.findUniqueOrThrow({
      where: { id: req.userId! },
      select: { airConditioning: true, windowAspect: true },
    });

    const baseInterval = computeWaterIntervalDays(
      plant.waterPreference,
      buildPlantEnv(plant, user)
    );
    const weather = await fetchUserWeatherSnapshot(app.prisma, req.userId!);
    const interval = applyWeatherToIntervalDays(baseInterval, weather);

    await app.prisma.$transaction([
      app.prisma.careTask.deleteMany({
        where: { plantId: id, status: CareTaskStatus.pending },
      }),
      app.prisma.carePlan.update({
        where: { plantId: id },
        data: { baseIntervalDays: interval },
      }),
    ]);

    const generated = generateWaterTasks({
      asOf: new Date(),
      intervalDays: interval,
      horizonDays: plant.carePlan.horizonDays,
      plantId: id,
    });
    const fertInterval = computeFertilizeIntervalDays(interval);
    const generatedFert = generateFertilizeTasks({
      asOf: new Date(),
      intervalDays: fertInterval,
      horizonDays: plant.carePlan.horizonDays,
      plantId: id,
    });

    const asOfRegen = new Date();
    const repotDue = nextPeriodicDueDate(
      plant.createdAt,
      REPOT_PERIOD_DAYS,
      asOfRegen
    );
    const inspectDue = nextPeriodicDueDate(
      plant.createdAt,
      INSPECT_PERIOD_DAYS,
      asOfRegen
    );

    await app.prisma.careTask.createMany({
      data: [
        ...generated.map((g) => ({
          plantId: g.plantId,
          type: CareTaskType.water,
          dueDate: g.dueDate,
          status: CareTaskStatus.pending,
        })),
        ...generatedFert.map((g) => ({
          plantId: g.plantId,
          type: CareTaskType.fertilize,
          dueDate: g.dueDate,
          status: CareTaskStatus.pending,
        })),
        {
          plantId: id,
          type: CareTaskType.repot,
          dueDate: repotDue,
          status: CareTaskStatus.pending,
        },
        {
          plantId: id,
          type: CareTaskType.inspect,
          dueDate: inspectDue,
          status: CareTaskStatus.pending,
        },
      ],
    });

    req.log.info(
      { planRegenerateMs: Date.now() - t0, horizonDays: plant.carePlan.horizonDays },
      "plan_regenerated"
    );
    return { ok: true, baseIntervalDays: interval };
  });
};

export default plantsRoutes;
