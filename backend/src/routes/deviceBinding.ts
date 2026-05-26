import { randomBytes } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { loadConfig } from "../config.js";
import { authenticate } from "../lib/authGuard.js";

const BINDING_CODE_TTL_MS = 10 * 60 * 1000;
const BINDING_CODE_BYTES = 8;

const claimBodySchema = z.object({
  code: z.string().min(8).max(64).transform((s) => s.trim().toLowerCase()),
  hardwareId: z.string().min(1).max(128),
});

/** 简单按 IP 限流 claim，减轻暴力猜码 */
const claimHits = new Map<string, number[]>();
const CLAIM_WINDOW_MS = 60_000;
const CLAIM_MAX_PER_WINDOW = 40;

function rateLimitClaim(ip: string): boolean {
  const now = Date.now();
  let arr = claimHits.get(ip) ?? [];
  arr = arr.filter((t) => now - t < CLAIM_WINDOW_MS);
  if (arr.length >= CLAIM_MAX_PER_WINDOW) return false;
  arr.push(now);
  claimHits.set(ip, arr);
  return true;
}

function clientIp(req: { ip?: string; headers: Record<string, unknown> }): string {
  const xf = req.headers["x-forwarded-for"];
  const x = Array.isArray(xf) ? xf[0] : typeof xf === "string" ? xf : "";
  const first = x.split(",")[0]?.trim();
  if (first) return first;
  return req.ip ?? "unknown";
}

const deviceBindingRoutes: FastifyPluginAsync = async (app) => {
  /** 登录用户生成一次性绑定码（给自研固件配网页填写）。 */
  app.post(
    "/devices/binding-codes",
    { preHandler: [authenticate] },
    async (req, reply) => {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + BINDING_CODE_TTL_MS);
      const code = randomBytes(BINDING_CODE_BYTES).toString("hex");

      await app.prisma.deviceBindingCode.create({
        data: {
          userId: req.userId!,
          code,
          expiresAt,
        },
      });

      req.log.info({ userId: req.userId }, "device_binding_code_created");
      return { code, expiresAt: expiresAt.toISOString() };
    }
  );

  /**
   * 固件在 STA 联网后调用：用绑定码 + hardwareId 换 userId，并预建 Device 行。
   * 若服务端配置了 SENSOR_HMAC_SECRET，会一并返回供设备写入 NVS（与既有 ingest 共用）。
   */
  app.post("/devices/claim-binding-code", async (req, reply) => {
    const ip = clientIp(req);
    if (!rateLimitClaim(ip)) {
      return reply.status(429).send({ error: "rate_limited" });
    }

    const parsed = claimBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_body" });
    }

    const { code, hardwareId } = parsed.data;

    try {
      const result = await app.prisma.$transaction(async (tx) => {
        const row = await tx.deviceBindingCode.findFirst({
          where: {
            code,
            usedAt: null,
            expiresAt: { gt: new Date() },
          },
        });
        if (!row) {
          return { kind: "not_found" as const };
        }

        const existing = await tx.device.findFirst({
          where: { hardwareId },
          select: { id: true, userId: true },
        });
        if (existing && existing.userId !== row.userId) {
          return { kind: "wrong_owner" as const };
        }

        await tx.device.upsert({
          where: {
            userId_hardwareId: {
              userId: row.userId,
              hardwareId,
            },
          },
          create: {
            userId: row.userId,
            hardwareId,
          },
          update: {},
        });

        await tx.deviceBindingCode.update({
          where: { id: row.id },
          data: { usedAt: new Date() },
        });

        return { kind: "ok" as const, userId: row.userId };
      });

      if (result.kind === "not_found") {
        return reply.status(404).send({ error: "invalid_or_expired_code" });
      }
      if (result.kind === "wrong_owner") {
        return reply
          .status(409)
          .send({ error: "hardware_id_bound_to_other_user" });
      }

      const config = loadConfig();
      const out: { ok: true; userId: string; sensorKey?: string } = {
        ok: true,
        userId: result.userId,
      };
      if (config.SENSOR_HMAC_SECRET) {
        out.sensorKey = config.SENSOR_HMAC_SECRET;
      }

      req.log.info({ userId: result.userId, hardwareId }, "device_binding_claimed");
      return out;
    } catch (e) {
      req.log.warn({ err: String(e) }, "device_binding_claim_failed");
      return reply.status(500).send({ error: "claim_failed" });
    }
  });
};

export default deviceBindingRoutes;
