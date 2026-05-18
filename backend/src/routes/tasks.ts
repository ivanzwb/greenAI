import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { CareTaskStatus, CareTaskType } from "@prisma/client";
import {
  applyWeatherToIntervalDays,
  computeWaterIntervalDays,
  generateWaterTasks,
} from "../domain/careEngine.js";
import { utcRangeForUserLocalToday } from "../lib/dayRange.js";
import { authenticate } from "../lib/authGuard.js";
import { fetchUserWeatherSnapshot } from "../lib/userWeather.js";

const tasksRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", authenticate);

  app.get("/tasks/today", async (req) => {
    const user = await app.prisma.user.findUniqueOrThrow({
      where: { id: req.userId! },
      select: { timezone: true },
    });
    const { start, end } = utcRangeForUserLocalToday(new Date(), user.timezone);

    return app.prisma.careTask.findMany({
      where: {
        status: CareTaskStatus.pending,
        dueDate: { gte: start, lt: end },
        plant: { userId: req.userId! },
      },
      include: { plant: true },
      orderBy: { dueDate: "asc" },
    });
  });

  app.post("/tasks/:id/complete", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const task = await app.prisma.careTask.findFirst({
      where: { id, plant: { userId: req.userId! } },
      include: { plant: { include: { carePlan: true } } },
    });
    if (!task || !task.plant.carePlan)
      return reply.status(404).send({ error: "not_found" });

    await app.prisma.careTask.update({
      where: { id },
      data: { status: CareTaskStatus.completed },
    });

    const baseInterval = computeWaterIntervalDays(task.plant.waterPreference, {
      indoor: task.plant.indoor,
      heating: task.plant.heating,
      lightLevel: task.plant.lightLevel,
    });
    const weather = await fetchUserWeatherSnapshot(
      app.prisma,
      task.plant.userId
    );
    const interval = applyWeatherToIntervalDays(baseInterval, weather);

    const horizon = task.plant.carePlan.horizonDays;
    const generated = generateWaterTasks({
      asOf: new Date(),
      intervalDays: interval,
      horizonDays: horizon,
      plantId: task.plantId,
    });

    const existingDates = new Set(
      (
        await app.prisma.careTask.findMany({
          where: { plantId: task.plantId, type: CareTaskType.water },
          select: { dueDate: true },
        })
      ).map((t) => t.dueDate.toISOString().slice(0, 10))
    );

    const toCreate = generated.filter(
      (g) => !existingDates.has(g.dueDate.toISOString().slice(0, 10))
    );

    if (toCreate.length) {
      await app.prisma.careTask.createMany({
        data: toCreate.map((g) => ({
          plantId: g.plantId,
          type: CareTaskType.water,
          dueDate: g.dueDate,
          status: CareTaskStatus.pending,
        })),
      });
    }

    return { ok: true };
  });

  app.post("/tasks/:id/skip", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const body = z
      .object({ reason: z.string().optional() })
      .safeParse(req.body ?? {});
    if (!body.success) return reply.status(400).send({ error: "invalid_body" });

    const task = await app.prisma.careTask.findFirst({
      where: { id, plant: { userId: req.userId! } },
    });
    if (!task) return reply.status(404).send({ error: "not_found" });

    const bump = new Date(task.dueDate);
    bump.setUTCDate(bump.getUTCDate() + 2);

    await app.prisma.careTask.update({
      where: { id },
      data: {
        status: CareTaskStatus.skipped,
        lastError: body.data.reason ?? "skipped",
      },
    });

    await app.prisma.careTask.create({
      data: {
        plantId: task.plantId,
        type: task.type,
        dueDate: bump,
        status: CareTaskStatus.pending,
      },
    });

    return { ok: true, nextDueDate: bump };
  });
};

export default tasksRoutes;

