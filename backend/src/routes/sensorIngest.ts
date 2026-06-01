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

/** 设备侧只上报 hardwareId；userId / plantId 由服务端按已登记 Device 解析。 */
const payloadSchema = z.object({
  hardwareId: z.string().min(1).max(128),
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
  entries: z.array(logEntrySchema).min(1).max(200),
});

/** 固件 POST /internal/devices/config 的请求体（HMAC 同 ingest）。 */
const configPayloadSchema = z.object({
  hardwareId: z.string().min(1).max(128),
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

    const deviceRow = await app.prisma.device.findFirst({
      where: { hardwareId: parsed.data.hardwareId },
      select: { userId: true },
    });
    if (!deviceRow) {
      return reply.status(404).send({ error: "device_not_registered" });
    }

    const result = await ingestSensorReadings(app.prisma, {
      hardwareId: parsed.data.hardwareId,
      userId: deviceRow.userId,
      plantId: undefined,
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

    const deviceRow = await app.prisma.device.findFirst({
      where: { hardwareId: parsed.data.hardwareId },
      select: { userId: true },
    });
    if (!deviceRow) {
      return reply.status(404).send({ error: "device_not_registered" });
    }

    const result = await ingestDeviceLogs(app.prisma, {
      hardwareId: parsed.data.hardwareId,
      userId: deviceRow.userId,
      plantId: undefined,
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

  /**
   * 设备配置拉取：固件仅上报 `hardwareId`，服务端按已登记设备返回 `wateringMessage`。
   * 与 ingest 共用 SENSOR_HMAC_SECRET 与签名格式 (x-timestamp + x-signature)。
   * 响应：
   *   {
   *     wateringMessage: string | null  // null = 让固件用内置默认句
   *   }
   */
  app.post("/internal/devices/config", async (req, reply) => {
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

    const parsed = configPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload" });
    }

    const device = await app.prisma.device.findFirst({
      where: { hardwareId: parsed.data.hardwareId },
      select: { wateringMessage: true },
    });
    if (!device) {
      return reply.status(404).send({ error: "device_not_found" });
    }

    return { wateringMessage: device.wateringMessage };
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
