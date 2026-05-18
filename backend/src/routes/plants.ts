import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  CareTaskStatus,
  CareTaskType,
  LightLevel,
  WaterPreference,
} from "@prisma/client";
import {
  applyWeatherToIntervalDays,
  computeWaterIntervalDays,
  generateWaterTasks,
} from "../domain/careEngine.js";
import { authenticate } from "../lib/authGuard.js";
import { fetchUserWeatherSnapshot } from "../lib/userWeather.js";

const createBody = z.object({
  nickname: z.string().min(1),
  speciesLabel: z.string().min(1),
  waterPreference: z.nativeEnum(WaterPreference),
  indoor: z.boolean(),
  heating: z.boolean(),
  lightLevel: z.nativeEnum(LightLevel),
});

const plantsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", authenticate);

  app.get("/plants/:id", async (req, reply) => {
    const id = (req.params as { id: string }).id;
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

    const baseInterval = computeWaterIntervalDays(parsed.data.waterPreference, {
      indoor: parsed.data.indoor,
      heating: parsed.data.heating,
      lightLevel: parsed.data.lightLevel,
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
        carePlan: {
          create: { baseIntervalDays: interval, horizonDays: 14 },
        },
      },
    });

    const asOf = new Date();
    const generated = generateWaterTasks({
      asOf,
      intervalDays: interval,
      horizonDays: 14,
      plantId: plant.id,
    });

    await app.prisma.careTask.createMany({
      data: generated.map((g) => ({
        plantId: g.plantId,
        type: CareTaskType.water,
        dueDate: g.dueDate,
        status: CareTaskStatus.pending,
      })),
    });

    return plant;
  });

  app.patch("/plants/:id", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const parsed = createBody.partial().safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid_body" });

    const plant = await app.prisma.plant.findFirst({
      where: { id, userId: req.userId! },
    });
    if (!plant) return reply.status(404).send({ error: "not_found" });

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

    const baseInterval = computeWaterIntervalDays(plant.waterPreference, {
      indoor: plant.indoor,
      heating: plant.heating,
      lightLevel: plant.lightLevel,
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

    await app.prisma.careTask.createMany({
      data: generated.map((g) => ({
        plantId: g.plantId,
        type: CareTaskType.water,
        dueDate: g.dueDate,
        status: CareTaskStatus.pending,
      })),
    });

    return { ok: true, baseIntervalDays: interval };
  });
};

export default plantsRoutes;
