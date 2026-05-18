import type { FastifyPluginAsync } from "fastify";
import { authenticate } from "../lib/authGuard.js";
import { fetchOpenMeteoCurrent } from "../services/openMeteo.js";

const weatherRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", authenticate);

  app.get("/weather/current", async (req, reply) => {
    const user = await app.prisma.user.findUniqueOrThrow({
      where: { id: req.userId! },
      select: { latitude: true, longitude: true },
    });
    if (user.latitude == null || user.longitude == null) {
      return reply.status(400).send({ error: "no_location" });
    }
    try {
      const current = await fetchOpenMeteoCurrent({
        latitude: user.latitude,
        longitude: user.longitude,
      });
      return {
        ...current,
        latitude: user.latitude,
        longitude: user.longitude,
      };
    } catch {
      return reply.status(502).send({ error: "weather_upstream" });
    }
  });
};

export default weatherRoutes;
