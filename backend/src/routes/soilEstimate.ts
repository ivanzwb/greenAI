import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { loadConfig, resolveDiagnoseLlmSettings } from "../config.js";
import { authenticate } from "../lib/authGuard.js";
import { estimateSoilMoistureFromPhoto } from "../services/soilPhotoLlm.js";

const bodySchema = z.object({
  imageBase64: z.string().min(80).max(8_000_000),
});

const soilEstimateRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", authenticate);

  /** 盆土/土壤特写照片 → 视觉大模型估干湿（与 diagnose LLM 共用环境变量）。 */
  app.post("/soil/estimate-photo", async (req, reply) => {
    const cfg = loadConfig();
    const llm = resolveDiagnoseLlmSettings(cfg);
    if (!llm) {
      return reply.status(503).send({ error: "soil_estimate_llm_disabled" });
    }

    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_body" });
    }

    try {
      const estimate = await estimateSoilMoistureFromPhoto({
        baseUrl: llm.baseUrl,
        apiKey: llm.apiKey,
        model: llm.model,
        imageBase64: parsed.data.imageBase64,
      });
      return estimate;
    } catch (e) {
      req.log.warn({ err: String(e) }, "soil_estimate_llm_failed");
      return reply.status(502).send({ error: "soil_estimate_llm_upstream" });
    }
  });
};

export default soilEstimateRoutes;
