import type { FastifyPluginAsync } from "fastify";
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
} from "../domain/careEngine.js";
import { loadConfig, isBaiduPlantIdentifyConfigured } from "../config.js";
import { authenticate } from "../lib/authGuard.js";
import { fetchUserWeatherSnapshot } from "../lib/userWeather.js";
import { identifyPlantWithBaidu } from "../services/baiduPlantIdentify.js";

const createBody = z.object({
  nickname: z.string().min(1),
  speciesLabel: z.string().min(1),
  waterPreference: z.nativeEnum(WaterPreference),
  indoor: z.boolean(),
  heating: z.boolean(),
  lightLevel: z.nativeEnum(LightLevel),
  soilMoistureHint: z.nativeEnum(SoilMoistureHint).optional(),
});

const patchBody = createBody.partial().extend({
  soilMoistureHint: z.nativeEnum(SoilMoistureHint).nullable().optional(),
});

const identifyBody = z.object({
  imageBase64: z.string().min(50).max(8_000_000),
});

const plantsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", authenticate);

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
      const best = filtered[0];
      return { best, candidates: filtered };
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

    const baseInterval = computeWaterIntervalDays(parsed.data.waterPreference, {
      indoor: parsed.data.indoor,
      heating: parsed.data.heating,
      lightLevel: parsed.data.lightLevel,
      soilMoistureHint: parsed.data.soilMoistureHint ?? null,
    });
    const weather = await fetchUserWeatherSnapshot(app.prisma, req.userId!);
    const interval = applyWeatherToIntervalDays(baseInterval, weather);

    const plant = await app.prisma.plant.create({
      data: {
        userId: req.userId!,
        nickname: parsed.data.nickname,
        speciesLabel: parsed.data.speciesLabel,
        waterPreference: parsed.data.waterPreference,
        indoor: parsed.data.indoor,
        heating: parsed.data.heating,
        lightLevel: parsed.data.lightLevel,
        soilMoistureHint: parsed.data.soilMoistureHint,
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

    const baseInterval = computeWaterIntervalDays(plant.waterPreference, {
      indoor: plant.indoor,
      heating: plant.heating,
      lightLevel: plant.lightLevel,
      soilMoistureHint: plant.soilMoistureHint,
    });
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
