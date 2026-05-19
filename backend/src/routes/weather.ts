import type { FastifyPluginAsync } from "fastify";
import { authenticate } from "../lib/authGuard.js";
import { fetchUserWeatherSnapshot } from "../lib/userWeather.js";
import { fetchOpenMeteoDailyForecast } from "../services/openMeteo.js";
import { find } from "geo-tz";

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
    const snap = await fetchUserWeatherSnapshot(app.prisma, req.userId!);
    if (!snap) {
      return reply.status(502).send({ error: "weather_upstream" });
    }
    return {
      ...snap,
      latitude: user.latitude,
      longitude: user.longitude,
    };
  });

  /** 未来数日逐日预报（与用户时区对齐），用于设置页与养护提示。 */
  app.get("/weather/forecast", async (req, reply) => {
    const user = await app.prisma.user.findUniqueOrThrow({
      where: { id: req.userId! },
      select: { latitude: true, longitude: true, timezone: true },
    });
    if (user.latitude == null || user.longitude == null) {
      return reply.status(400).send({ error: "no_location" });
    }
    try {
      const days = await fetchOpenMeteoDailyForecast({
        latitude: user.latitude,
        longitude: user.longitude,
        timezone: user.timezone || "Asia/Shanghai",
        forecastDays: 3,
});

  /** Detect IANA timezone from GPS coordinates using geo-tz. */
  app.get("/timezone/detect", async (req, reply) => {
    const q = req.query as { lat?: string; lng?: string };
    const lat = q.lat != null ? Number(q.lat) : NaN;
    const lng = q.lng != null ? Number(q.lng) : NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return reply.status(400).send({ error: "invalid_coords" });
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return reply.status(400).send({ error: "out_of_range" });
    }
    const zones = find(lat, lng);
    const timezone = (Array.isArray(zones) && zones.length > 0) ? zones[0] : "UTC";
    return { timezone };
  });

      return {
        timezone: user.timezone,
        latitude: user.latitude,
        longitude: user.longitude,
        days,
      };
    } catch {
      return reply.status(502).send({ error: "weather_upstream" });
    }
  });
};

export default weatherRoutes;
