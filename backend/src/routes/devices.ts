import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { authenticate } from "../lib/authGuard.js";
import { loadPlantSensorSeries } from "../lib/sensorSeries.js";

const patchBody = z.object({
  /** 用户起的设备名（客厅探针 / 阳台 1 号…）；传 null 清空 */
  label: z.string().max(60).nullable().optional(),
  /** 绑定到的植物 id；传 null 解除绑定；不传则不改 */
  plantId: z.string().min(1).max(64).nullable().optional(),
  /**
   * 浇水时设备朗读的拟人化文案。
   * - 传 string：保存为该值（最长 200 字符）
   * - 传 null：清空（设备回退到固件内置默认句）
   * - 不传：保持不变
   */
  wateringMessage: z.string().max(200).nullable().optional(),
});

const seriesQuery = z.object({
  hours: z.coerce.number().int().min(1).max(24 * 14).optional(),
});

const deviceLogsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
});

const devicesRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", authenticate);

  /** 当前用户名下的全部设备，供「绑定到该植物」选择器使用。 */
  app.get("/devices", async (req) => {
    return app.prisma.device.findMany({
      where: { userId: req.userId! },
      orderBy: [{ lastSeenAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        hardwareId: true,
        label: true,
        plantId: true,
        wateringMessage: true,
        lastSeenAt: true,
        createdAt: true,
      },
    });
  });

  /** 设备经 HMAC 上报后落库的最近若干条运行日志（当前用户名下设备）。 */
  app.get("/devices/:id/logs", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const device = await app.prisma.device.findFirst({
      where: { id, userId: req.userId! },
      select: { id: true },
    });
    if (!device) return reply.status(404).send({ error: "not_found" });
    const q = deviceLogsQuery.safeParse(req.query ?? {});
    if (!q.success) return reply.status(400).send({ error: "invalid_query" });
    const logs = await app.prisma.deviceIngestLog.findMany({
      where: { deviceId: id },
      orderBy: { createdAt: "desc" },
      take: q.data.limit,
      select: {
        id: true,
        level: true,
        message: true,
        occurredAt: true,
        meta: true,
        createdAt: true,
      },
    });
    return { logs };
  });

  /** 重命名 / 绑定 / 解绑设备。 */
  app.patch("/devices/:id", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const parsed = patchBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_body" });
    }
    const device = await app.prisma.device.findFirst({
      where: { id, userId: req.userId! },
      select: { id: true },
    });
    if (!device) return reply.status(404).send({ error: "not_found" });

    const data: { label?: string | null; plantId?: string | null; wateringMessage?: string | null } = {};
    if (parsed.data.label !== undefined) {
      data.label = parsed.data.label;
    }
    if (parsed.data.plantId !== undefined) {
      if (parsed.data.plantId === null) {
        data.plantId = null;
      } else {
        const plant = await app.prisma.plant.findFirst({
          where: { id: parsed.data.plantId, userId: req.userId! },
          select: { id: true },
        });
        if (!plant) {
          return reply.status(404).send({ error: "plant_not_found" });
        }
        data.plantId = plant.id;
      }
    }
    if (parsed.data.wateringMessage !== undefined) {
      const v = parsed.data.wateringMessage;
      data.wateringMessage = v === null ? null : v.trim().slice(0, 200);
    }
    if (Object.keys(data).length === 0) {
      // 无可改字段：直接回当前快照
      return app.prisma.device.findUniqueOrThrow({ where: { id } });
    }
    return app.prisma.device.update({
      where: { id },
      data,
      select: {
        id: true,
        hardwareId: true,
        label: true,
        plantId: true,
        wateringMessage: true,
        lastSeenAt: true,
        createdAt: true,
      },
    });
  });

  /** 当前植物的传感器历史与最新读数，用于详情页绘图。 */
  app.get("/plants/:id/sensor/series", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const plant = await app.prisma.plant.findFirst({
      where: { id, userId: req.userId! },
      select: { id: true, speciesLabel: true },
    });
    if (!plant) return reply.status(404).send({ error: "not_found" });
    const q = seriesQuery.safeParse(req.query ?? {});
    if (!q.success) return reply.status(400).send({ error: "invalid_query" });
    return loadPlantSensorSeries(app.prisma, plant, { hours: q.data.hours });
  });
};

export default devicesRoutes;
