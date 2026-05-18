import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { loadConfig } from "../config.js";
import { verifyCronHmac } from "../lib/hmacAuth.js";
import { getMetricsSummary } from "../services/metricsSummary.js";
import { runReminderJob } from "../services/reminderJob.js";

function assertCronAuth(req: {
  headers: Record<string, string | string[] | undefined>;
}): boolean {
  const config = loadConfig();
  return verifyCronHmac({
    secret: config.CRON_HMAC_SECRET,
    timestampHeader: String(req.headers["x-timestamp"] ?? ""),
    signatureHeader: String(req.headers["x-signature"] ?? ""),
    skewSeconds: 300,
  });
}

const internalJobsRoutes: FastifyPluginAsync = async (app) => {
  app.post("/internal/jobs/reminders", async (req, reply) => {
    if (!assertCronAuth(req)) {
      return reply.status(401).send({ error: "invalid_signature" });
    }

    const result = await runReminderJob(app.prisma);
    req.log.info(result);
    return result;
  });

  app.get("/internal/metrics/summary", async (req, reply) => {
    if (!assertCronAuth(req)) {
      return reply.status(401).send({ error: "invalid_signature" });
    }

    const q = z
      .object({
        days: z.coerce.number().int().min(1).max(90).optional(),
      })
      .safeParse(req.query ?? {});
    if (!q.success) return reply.status(400).send({ error: "invalid_query" });

    const days = q.data.days ?? 7;
    const summary = await getMetricsSummary(app.prisma, days);
    req.log.info({ metricsWindowDays: days });
    return summary;
  });
};

export default internalJobsRoutes;
