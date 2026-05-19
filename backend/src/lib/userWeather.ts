import type { PrismaClient } from "@prisma/client";
import {
  type WeatherSnapshot,
  forecastDryBiasFromDaily,
  forecastWetBiasFromDaily,
} from "../domain/careEngine.js";
import {
  fetchOpenMeteoCurrent,
  fetchOpenMeteoDailyForecast,
} from "../services/openMeteo.js";

const weatherCache = new Map<
  string,
  { expiresAtMs: number; snapshot: WeatherSnapshot }
>();
const WEATHER_CACHE_TTL_MS = 30 * 60 * 1000;

/** Vitest helper — clear in-memory weather cache. */
export function __resetUserWeatherCacheForTests(): void {
  weatherCache.clear();
}

function cacheKey(
  lat: number,
  lon: number,
  timezone: string
): string {
  const r = (n: number) => Math.round(n * 100) / 100;
  return `${r(lat)}_${r(lon)}_${timezone}`;
}

export async function fetchUserWeatherSnapshot(
  prisma: PrismaClient,
  userId: string
): Promise<WeatherSnapshot | null> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { latitude: true, longitude: true, timezone: true },
  });
  if (u?.latitude == null || u?.longitude == null) return null;
  const tz = u.timezone || "Asia/Shanghai";
  const key = cacheKey(u.latitude, u.longitude, tz);
  const now = Date.now();
  const hit = weatherCache.get(key);
  if (hit && hit.expiresAtMs > now) {
    return hit.snapshot;
  }

  try {
    const current = await fetchOpenMeteoCurrent({
      latitude: u.latitude,
      longitude: u.longitude,
    });

    let upcomingWetBias: number | undefined;
    let upcomingDryBias: number | undefined;
    try {
      const daily = await fetchOpenMeteoDailyForecast({
        latitude: u.latitude,
        longitude: u.longitude,
        timezone: tz,
        forecastDays: 3,
      });
      const wet = forecastWetBiasFromDaily(daily);
      const dry = forecastDryBiasFromDaily(daily);
      if (daily.length > 0 && wet > 0) {
        upcomingWetBias = wet;
      }
      if (daily.length > 1 && dry > 0) {
        upcomingDryBias = dry;
      }
    } catch {
      /* forecast optional — current-only still useful */
    }

    const snapshot: WeatherSnapshot = {
      temperatureC: current.temperatureC,
      relativeHumidity: current.relativeHumidity,
      ...(upcomingWetBias !== undefined ? { upcomingWetBias } : {}),
      ...(upcomingDryBias !== undefined ? { upcomingDryBias } : {}),
    };
    weatherCache.set(key, {
      expiresAtMs: now + WEATHER_CACHE_TTL_MS,
      snapshot,
    });
    return snapshot;
  } catch {
    return null;
  }
}
