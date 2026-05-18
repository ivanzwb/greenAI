import type { PrismaClient } from "@prisma/client";
import type { WeatherSnapshot } from "../domain/careEngine.js";
import { fetchOpenMeteoCurrent } from "../services/openMeteo.js";

export async function fetchUserWeatherSnapshot(
  prisma: PrismaClient,
  userId: string
): Promise<WeatherSnapshot | null> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { latitude: true, longitude: true },
  });
  if (u?.latitude == null || u?.longitude == null) return null;
  try {
    return await fetchOpenMeteoCurrent({
      latitude: u.latitude,
      longitude: u.longitude,
    });
  } catch {
    return null;
  }
}
