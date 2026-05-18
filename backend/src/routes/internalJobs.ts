import type { FastifyPluginAsync } from "fastify";
import { loadConfig } from "../config.js";
import { verifyCronHmac } from "../lib/hmacAuth.js";
import { runReminderJob } from "../services/reminderJob.js";

const internalJobsRoutes: FastifyPluginAsync = async (app) => {
  app.post("/internal/jobs/reminders", async (req, reply) => {
    const config = loadConfig();
    const ok = verifyCronHmac({
      secret: config.CRON_HMAC_SECRET,
      timestampHeader: String(req.headers["x-timestamp"] ?? ""),
      signatureHeader: String(req.headers["x-signature"] ?? ""),
      skewSeconds: 300,
    });
    if (!ok) return reply.status(401).send({ error: "invalid_signature" });

    const result = await runReminderJob(app.prisma);
    req.log.info(result);
    return result;
  });
};

export default internalJobsRoutes;
