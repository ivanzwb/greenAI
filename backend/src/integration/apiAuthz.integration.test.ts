import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Fastify from "fastify";
import cors from "@fastify/cors";
import {
  CareTaskStatus,
  CareTaskType,
  LightLevel,
  WaterPreference,
} from "@prisma/client";
import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import prismaPlugin from "../plugins/prisma.js";
import deviceBindingRoutes from "../routes/deviceBinding.js";
import internalJobsRoutes from "../routes/internalJobs.js";
import plantsRoutes from "../routes/plants.js";
import sensorIngestRoutes from "../routes/sensorIngest.js";
import tasksRoutes from "../routes/tasks.js";
import { signUserToken } from "../lib/jwt.js";

function usesDockerComposeDbHostname(databaseUrl: string): boolean {
  try {
    const u = new URL(databaseUrl);
    return u.hostname === "db";
  } catch {
    return /@db[:/]/i.test(databaseUrl);
  }
}

/** When true, runs DB-backed API tests. Default: on if DATABASE_URL + JWT_SECRET are set. Opt out: SKIP_INTEGRATION_TESTS=1 or RUN_INTEGRATION_TESTS=0. Outside CI, skips when DATABASE_URL host is `db` (Compose); override with RUN_INTEGRATION_TESTS=1. */
const integrationOptOut =
  process.env.SKIP_INTEGRATION_TESTS === "1" ||
  process.env.SKIP_INTEGRATION_TESTS === "true" ||
  process.env.RUN_INTEGRATION_TESTS === "0" ||
  process.env.RUN_INTEGRATION_TESTS === "false";

const dbUrl = process.env.DATABASE_URL?.trim() ?? "";
const inCi = Boolean(process.env.CI || process.env.GITHUB_ACTIONS);
const forceIntegration =
  process.env.RUN_INTEGRATION_TESTS === "1" ||
  process.env.RUN_INTEGRATION_TESTS === "true";

const runIntegration =
  !integrationOptOut &&
  Boolean(dbUrl) &&
  Boolean(process.env.JWT_SECRET?.trim()) &&
  (forceIntegration || inCi || !usesDockerComposeDbHostname(dbUrl));

if (runIntegration) {
  process.env.WECHAT_APPID ||= "integration-test-appid";
  process.env.WECHAT_SECRET ||= "integration-test-secret";
  process.env.CRON_HMAC_SECRET ||= "integration-test-cron-secret-16";
  process.env.SENSOR_HMAC_SECRET ||= "integration-test-sensor-secret-16";
  process.env.SUBSCRIBE_TEMPLATE_ID ||= "integration-test-template-id";
}

async function buildApp(
  ...plugins: FastifyPluginAsync[]
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(cors, { origin: true });
  await app.register(prismaPlugin);
  for (const p of plugins) {
    await app.register(p);
  }
  await app.ready();
  return app;
}

describe.skipIf(!runIntegration)("API authz — plants & tasks", () => {
  let app: FastifyInstance | undefined;
  const secret = process.env.JWT_SECRET as string;
  let userAId = "";
  let userBId = "";
  let plantAId = "";
  let taskAId = "";

  beforeAll(async () => {
    app = await buildApp(plantsRoutes, tasksRoutes);
    const a = await app.prisma.user.create({
      data: { openid: `it-a-${randomUUID()}` },
    });
    const b = await app.prisma.user.create({
      data: { openid: `it-b-${randomUUID()}` },
    });
    userAId = a.id;
    userBId = b.id;
    const plant = await app.prisma.plant.create({
      data: {
        userId: userAId,
        nickname: "IntegrationPlant",
        speciesLabel: "Test",
        waterPreference: WaterPreference.medium,
        indoor: true,
        heating: false,
        lightLevel: LightLevel.medium,
        carePlan: { create: { baseIntervalDays: 7, horizonDays: 14 } },
      },
    });
    plantAId = plant.id;
    const task = await app.prisma.careTask.create({
      data: {
        plantId: plantAId,
        type: CareTaskType.water,
        dueDate: new Date("2030-06-01T00:00:00.000Z"),
        status: CareTaskStatus.pending,
      },
    });
    taskAId = task.id;
  });

  afterAll(async () => {
    if (!app) return;
    try {
      if (userAId && userBId) {
        await app.prisma.user.deleteMany({
          where: { id: { in: [userAId, userBId] } },
        });
      }
    } finally {
      await app.close();
    }
  });

  it("GET /plants/:id returns 401 without Authorization", async () => {
    const res = await app!.inject({ method: "GET", url: `/plants/${plantAId}` });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: "missing_token" });
  });

  it("GET /plants/:id returns 401 for invalid JWT", async () => {
    const res = await app!.inject({
      method: "GET",
      url: `/plants/${plantAId}`,
      headers: { authorization: "Bearer not-a-valid-jwt" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: "invalid_token" });
  });

  it("owner can GET their plant", async () => {
    const token = signUserToken(userAId, secret);
    const res = await app!.inject({
      method: "GET",
      url: `/plants/${plantAId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe(plantAId);
  });

  it("other user gets 404 for plant GET (no leak)", async () => {
    const token = signUserToken(userBId, secret);
    const res = await app!.inject({
      method: "GET",
      url: `/plants/${plantAId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: "not_found" });
  });

  it("other user cannot complete foreign task", async () => {
    const token = signUserToken(userBId, secret);
    const res = await app!.inject({
      method: "POST",
      url: `/tasks/${taskAId}/complete`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: "not_found" });
  });
});

describe.skipIf(!runIntegration)("API internal — cron HMAC", () => {
  let app: FastifyInstance | undefined;

  beforeAll(async () => {
    app = await buildApp(internalJobsRoutes);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it("POST /internal/jobs/reminders returns 401 when signature invalid", async () => {
    const res = await app!.inject({
      method: "POST",
      url: "/internal/jobs/reminders",
      headers: {
        "x-timestamp": String(Math.floor(Date.now() / 1000)),
        "x-signature": "00".repeat(32),
      },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: "invalid_signature" });
  });
});

describe.skipIf(!runIntegration)("API internal — sensor ingest HMAC", () => {
  let app: FastifyInstance | undefined;

  beforeAll(async () => {
    app = await buildApp(sensorIngestRoutes);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it("POST /internal/sensors/ingest returns 401 when signature invalid", async () => {
    const res = await app!.inject({
      method: "POST",
      url: "/internal/sensors/ingest",
      headers: {
        "content-type": "application/json",
        "x-timestamp": String(Math.floor(Date.now() / 1000)),
        "x-signature": "00".repeat(32),
      },
      payload: JSON.stringify({
        hardwareId: "test-hw",
        userId: "test-user",
        readings: [{ measuredAt: new Date().toISOString(), tempC: 22.5 }],
      }),
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: "invalid_signature" });
  });

  it("POST /internal/sensors/ingest accepts a correctly signed batch", async () => {
    const user = await app!.prisma.user.create({
      data: { openid: `it-sensor-${randomUUID()}` },
    });
    try {
      const body = JSON.stringify({
        hardwareId: "hw-abc-001",
        userId: user.id,
        readings: [
          {
            measuredAt: new Date("2030-06-01T00:00:00.000Z").toISOString(),
            tempC: 22.4,
            soilMoisture: 42.5,
            phLevel: 6.5,
            lux: 320,
          },
          {
            measuredAt: new Date("2030-06-01T00:15:00.000Z").toISOString(),
            tempC: 22.6,
            soilMoisture: 41.8,
          },
        ],
      });
      const ts = String(Math.floor(Date.now() / 1000));
      const crypto = await import("node:crypto");
      const bodyHash = crypto
        .createHash("sha256")
        .update(body, "utf8")
        .digest("hex");
      const sig = crypto
        .createHmac("sha256", process.env.SENSOR_HMAC_SECRET as string)
        .update(`${ts}\n${bodyHash}`)
        .digest("hex");

      const res = await app!.inject({
        method: "POST",
        url: "/internal/sensors/ingest",
        headers: {
          "content-type": "application/json",
          "x-timestamp": ts,
          "x-signature": sig,
        },
        payload: body,
      });
      expect(res.statusCode).toBe(200);
      const json = res.json() as {
        deviceId: string;
        inserted: number;
        deduped: number;
      };
      expect(json.inserted).toBe(2);
      expect(json.deduped).toBe(0);
      expect(json.deviceId).toMatch(/.+/);

      // Replaying the same batch must be idempotent (unique on deviceId+measuredAt).
      const replay = await app!.inject({
        method: "POST",
        url: "/internal/sensors/ingest",
        headers: {
          "content-type": "application/json",
          "x-timestamp": ts,
          "x-signature": sig,
        },
        payload: body,
      });
      expect(replay.statusCode).toBe(200);
      expect((replay.json() as { inserted: number }).inserted).toBe(0);
      expect((replay.json() as { deduped: number }).deduped).toBe(2);
    } finally {
      await app!.prisma.user.delete({ where: { id: user.id } });
    }
  });

  it("POST /internal/sensors/logs returns 401 when signature invalid", async () => {
    const res = await app!.inject({
      method: "POST",
      url: "/internal/sensors/logs",
      headers: {
        "content-type": "application/json",
        "x-timestamp": String(Math.floor(Date.now() / 1000)),
        "x-signature": "00".repeat(32),
      },
      payload: JSON.stringify({
        hardwareId: "test-hw",
        userId: "test-user",
        entries: [{ message: "hello" }],
      }),
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: "invalid_signature" });
  });

  it("POST /internal/sensors/logs accepts a correctly signed batch", async () => {
    const user = await app!.prisma.user.create({
      data: { openid: `it-devlog-${randomUUID()}` },
    });
    try {
      const body = JSON.stringify({
        hardwareId: "hw-log-xyz",
        userId: user.id,
        entries: [
          {
            level: "warn",
            message: "wifi flap",
            occurredAt: Math.floor(Date.now() / 1000),
          },
          { message: "boot ok", meta: { fw: "0.9.1" } },
        ],
      });
      const ts = String(Math.floor(Date.now() / 1000));
      const crypto = await import("node:crypto");
      const bodyHash = crypto
        .createHash("sha256")
        .update(body, "utf8")
        .digest("hex");
      const sig = crypto
        .createHmac("sha256", process.env.SENSOR_HMAC_SECRET as string)
        .update(`${ts}\n${bodyHash}`)
        .digest("hex");

      const res = await app!.inject({
        method: "POST",
        url: "/internal/sensors/logs",
        headers: {
          "content-type": "application/json",
          "x-timestamp": ts,
          "x-signature": sig,
        },
        payload: body,
      });
      expect(res.statusCode).toBe(200);
      const json = res.json() as { deviceId: string; inserted: number };
      expect(json.inserted).toBe(2);
      expect(json.deviceId).toMatch(/.+/);

      const dev = await app!.prisma.device.findUnique({
        where: {
          userId_hardwareId: { userId: user.id, hardwareId: "hw-log-xyz" },
        },
        select: { id: true },
      });
      expect(dev).not.toBeNull();
      const rows = await app!.prisma.deviceIngestLog.findMany({
        where: { deviceId: dev!.id },
        orderBy: { createdAt: "asc" },
      });
      expect(rows).toHaveLength(2);
      expect(rows[0]!.level).toBe("warn");
      expect(rows[1]!.level).toBe("info");
      expect(rows[1]!.meta).toEqual({ fw: "0.9.1" });
    } finally {
      await app!.prisma.user.delete({ where: { id: user.id } });
    }
  });
});

describe.skipIf(!runIntegration)("API device binding code", () => {
  let app: FastifyInstance | undefined;

  beforeAll(async () => {
    app = await buildApp(deviceBindingRoutes);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it("POST /devices/claim-binding-code creates Device after binding-codes", async () => {
    const user = await app!.prisma.user.create({
      data: { openid: `it-bind-${randomUUID()}` },
    });
    try {
      const token = signUserToken(user.id, process.env.JWT_SECRET as string);
      const gen = await app!.inject({
        method: "POST",
        url: "/devices/binding-codes",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(gen.statusCode).toBe(200);
      const { code } = gen.json() as { code: string };
      expect(code.length).toBeGreaterThanOrEqual(8);

      const claim = await app!.inject({
        method: "POST",
        url: "/devices/claim-binding-code",
        headers: { "content-type": "application/json" },
        payload: JSON.stringify({
          code,
          hardwareId: "hw-claim-integration-01",
        }),
      });
      expect(claim.statusCode).toBe(200);
      const body = claim.json() as { ok: boolean; userId: string; sensorKey?: string };
      expect(body.ok).toBe(true);
      expect(body.userId).toBe(user.id);
      if (process.env.SENSOR_HMAC_SECRET) {
        expect(body.sensorKey).toBe(process.env.SENSOR_HMAC_SECRET);
      }

      const dev = await app!.prisma.device.findUnique({
        where: {
          userId_hardwareId: {
            userId: user.id,
            hardwareId: "hw-claim-integration-01",
          },
        },
      });
      expect(dev).not.toBeNull();

      const replay = await app!.inject({
        method: "POST",
        url: "/devices/claim-binding-code",
        headers: { "content-type": "application/json" },
        payload: JSON.stringify({
          code,
          hardwareId: "hw-claim-integration-01",
        }),
      });
      expect(replay.statusCode).toBe(404);
    } finally {
      await app!.prisma.user.delete({ where: { id: user.id } });
    }
  });

  it("POST /devices/claim-binding-code 409 when hardwareId belongs to another user", async () => {
    const userA = await app!.prisma.user.create({
      data: { openid: `it-binda-${randomUUID()}` },
    });
    const userB = await app!.prisma.user.create({
      data: { openid: `it-bindb-${randomUUID()}` },
    });
    const hw = `hw-dispute-${randomUUID().slice(0, 8)}`;
    try {
      await app!.prisma.device.create({
        data: { userId: userA.id, hardwareId: hw },
      });
      const tokenB = signUserToken(userB.id, process.env.JWT_SECRET as string);
      const gen = await app!.inject({
        method: "POST",
        url: "/devices/binding-codes",
        headers: { authorization: `Bearer ${tokenB}` },
      });
      const { code } = gen.json() as { code: string };

      const claim = await app!.inject({
        method: "POST",
        url: "/devices/claim-binding-code",
        headers: { "content-type": "application/json" },
        payload: JSON.stringify({ code, hardwareId: hw }),
      });
      expect(claim.statusCode).toBe(409);
      expect(claim.json()).toMatchObject({
        error: "hardware_id_bound_to_other_user",
      });
    } finally {
      await app!.prisma.user.delete({ where: { id: userA.id } });
      await app!.prisma.user.delete({ where: { id: userB.id } });
    }
  });
});
