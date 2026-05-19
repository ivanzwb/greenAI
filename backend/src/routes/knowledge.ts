import type { FastifyPluginAsync } from "fastify";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

/** 与小程序 `miniprogram/data/knowledge.js` 同源，供 H5/管理端拉取（免 CMS 时的只读接口）。 */
const knowledgeRoutes: FastifyPluginAsync = async (app) => {
  app.get("/knowledge/articles", async (_req, reply) => {
    try {
      const modPath = join(__dirname, "../../../miniprogram/data/knowledge.js");
      const articles = require(modPath) as unknown;
      if (!Array.isArray(articles)) {
        return reply.status(500).send({ error: "knowledge_invalid" });
      }
      return articles;
    } catch {
      return reply.status(500).send({ error: "knowledge_load_failed" });
    }
  });
};

export default knowledgeRoutes;
