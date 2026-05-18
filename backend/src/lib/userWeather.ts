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

    return {
      temperatureC: current.temperatureC,
      relativeHumidity: current.relativeHumidity,
      ...(upcomingWetBias !== undefined ? { upcomingWetBias } : {}),
      ...(upcomingDryBias !== undefined ? { upcomingDryBias } : {}),
    };
  } catch {
    return null;
  }
}
