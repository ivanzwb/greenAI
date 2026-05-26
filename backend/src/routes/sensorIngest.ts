import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { z } from "zod";
import { loadConfig } from "../config.js";
import { verifyDeviceIngestHmac } from "../lib/hmacAuth.js";
import { ingestDeviceLogs } from "../services/deviceLogIngest.js";
import { ingestSensorReadings } from "../services/sensorIngest.js";

const readingSchema = z
  .object({
    measuredAt: z.union([z.string().datetime(), z.number().int()]),
    tempC: z.number().finite().min(-50).max(80).optional(),
    /** 土壤湿度 0..100% */
    soilMoisture: z.number().finite().min(0).max(100).optional(),
    /** 土壤 pH 0..14 */
    phLevel: z.number().finite().min(0).max(14).optional(),
    lux: z.number().finite().min(0).max(200_000).optional(),
  })
  .refine(
    (r) =>
      r.tempC !== undefined ||
      r.soilMoisture !== undefined ||
      r.phLevel !== undefined ||
      r.lux !== undefined,
    { message: "at_least_one_metric_required" }
  );

const payloadSchema = z.object({
  hardwareId: z.string().min(1).max(128),
  userId: z.string().min(1).max(64),
  /** 可选：设备绑定的植物 id。传入时服务端会校验该植物属于 `userId`。 */
  plantId: z.string().min(1).max(64).nullable().optional(),
  readings: z.array(readingSchema).min(1).max(200),
});

const logEntrySchema = z.object({
  level: z.enum(["debug", "info", "warn", "error"]).optional(),
  message: z.string().min(1).max(16_000),
  occurredAt: z.union([z.string().datetime(), z.number().int()]).optional(),
  meta: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .optional()
    .refine((m) => !m || Object.keys(m).length <= 32, {
      message: "meta_keys_max_32",
    }),
});

const logPayloadSchema = z.object({
  hardwareId: z.string().min(1).max(128),
  userId: z.string().min(1).max(64),
  plantId: z.string().min(1).max(64).nullable().optional(),
  entries: z.array(logEntrySchema).min(1).max(200),
});

const sensorIngestRoutes: FastifyPluginAsync = async (app) => {
  // Encapsulated raw-body capture: replace the default JSON parser within
  // this plugin's scope so HMAC can be verified against the exact bytes the
  // client signed. Because this plugin is registered without `fastify-plugin`,
  // the override does not leak to sibling routes.
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (req, body, done) => {
      const raw = typeof body === "string" ? body : body.toString("utf8");
      (req as unknown as { rawBody: string }).rawBody = raw;
      if (raw.length === 0) {
        done(null, {});
        return;
      }
      try {
        done(null, JSON.parse(raw));
      } catch (err) {
        const e = err as Error & { statusCode?: number };
        e.statusCode = 400;
        done(e, undefined);
      }
    }
  );

  app.post("/internal/sensors/ingest", async (req, reply) => {
    const secret = sensorIngestSecret(reply);
    if (!secret) return;

    const rawBody =
      (req as unknown as { rawBody?: string }).rawBody ?? "";

    if (!verifyDeviceIngestHmac({
      secret,
      timestampHeader: stringHeader(req.headers["x-timestamp"]),
      signatureHeader: stringHeader(req.headers["x-signature"]),
      rawBody,
      skewSeconds: 300,
    })) {
      return reply.status(401).send({ error: "invalid_signature" });
    }

    const parsed = payloadSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload" });
    }

    const userExists = await app.prisma.user.findUnique({
      where: { id: parsed.data.userId },
      select: { id: true },
    });
    if (!userExists) {
      return reply.status(404).send({ error: "user_not_found" });
    }

    if (parsed.data.plantId) {
      const plant = await app.prisma.plant.findFirst({
        where: { id: parsed.data.plantId, userId: parsed.data.userId },
        select: { id: true },
      });
      if (!plant) {
        return reply.status(404).send({ error: "plant_not_found" });
      }
    }

    const result = await ingestSensorReadings(app.prisma, {
      hardwareId: parsed.data.hardwareId,
      userId: parsed.data.userId,
      plantId: parsed.data.plantId ?? undefined,
      readings: parsed.data.readings.map((r) => ({
        measuredAt: toDate(r.measuredAt),
        tempC: r.tempC,
        soilMoisture: r.soilMoisture,
        phLevel: r.phLevel,
        lux: r.lux,
      })),
    });

    req.log.info(
      {
        deviceId: result.deviceId,
        inserted: result.inserted,
        deduped: result.deduped,
      },
      "sensor_ingest"
    );
    return result;
  });

  /** 固件运行日志上报：与 `/internal/sensors/ingest` 共用 `SENSOR_HMAC_SECRET` 与请求头签名算法。 */
  app.post("/internal/sensors/logs", async (req, reply) => {
    const secret = sensorIngestSecret(reply);
    if (!secret) return;

    const rawBody =
      (req as unknown as { rawBody?: string }).rawBody ?? "";

    if (!verifyDeviceIngestHmac({
      secret,
      timestampHeader: stringHeader(req.headers["x-timestamp"]),
      signatureHeader: stringHeader(req.headers["x-signature"]),
      rawBody,
      skewSeconds: 300,
    })) {
      return reply.status(401).send({ error: "invalid_signature" });
    }

    const parsed = logPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload" });
    }

    const userExists = await app.prisma.user.findUnique({
      where: { id: parsed.data.userId },
      select: { id: true },
    });
    if (!userExists) {
      return reply.status(404).send({ error: "user_not_found" });
    }

    if (parsed.data.plantId) {
      const plant = await app.prisma.plant.findFirst({
        where: { id: parsed.data.plantId, userId: parsed.data.userId },
        select: { id: true },
      });
      if (!plant) {
        return reply.status(404).send({ error: "plant_not_found" });
      }
    }

    const result = await ingestDeviceLogs(app.prisma, {
      hardwareId: parsed.data.hardwareId,
      userId: parsed.data.userId,
      plantId: parsed.data.plantId ?? undefined,
      entries: parsed.data.entries.map((e) => ({
        level: e.level ?? "info",
        message: e.message,
        occurredAt:
          e.occurredAt !== undefined ? toDate(e.occurredAt) : undefined,
        meta: e.meta,
      })),
    });

    req.log.info(
      { deviceId: result.deviceId, inserted: result.inserted },
      "device_log_ingest"
    );
    return result;
  });
};

function sensorIngestSecret(reply: FastifyReply): string | undefined {
  const config = loadConfig();
  if (!config.SENSOR_HMAC_SECRET) {
    void reply.status(503).send({ error: "sensor_ingest_disabled" });
    return undefined;
  }
  return config.SENSOR_HMAC_SECRET;
}

function stringHeader(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

function toDate(v: string | number): Date {
  if (typeof v === "number") return new Date(v * 1000);
  return new Date(v);
}

export default sensorIngestRoutes;
