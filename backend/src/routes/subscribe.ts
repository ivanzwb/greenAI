import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { authenticate } from "../lib/authGuard.js";

const bodySchema = z.object({
  templateId: z.string(),
  acceptCount: z.number().int().min(0).max(10),
});

const subscribeRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", authenticate);

  app.post("/subscribe/report", async (req, reply) => {
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid_body" });

    req.log = req.log.child({
      templateId: parsed.data.templateId,
      acceptCount: parsed.data.acceptCount,
    });

    await app.prisma.subscribeGrant.upsert({
      where: {
        userId_templateId: {
          userId: req.userId!,
          templateId: parsed.data.templateId,
        },
      },
      create: {
        userId: req.userId!,
        templateId: parsed.data.templateId,
        quota: parsed.data.acceptCount,
      },
      update: {
        quota: { increment: parsed.data.acceptCount },
      },
    });

    return { ok: true, templateId: parsed.data.templateId };
  });
};

export default subscribeRoutes;
