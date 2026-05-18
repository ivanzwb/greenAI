export type WaterPreference = "low" | "medium" | "high";
export type LightLevel = "low" | "medium" | "high";

/** Current outdoor-ish conditions (e.g. from Open-Meteo). Used only to nudge watering cadence. */
export type WeatherSnapshot = {
  temperatureC: number;
  relativeHumidity: number;
};

export type PlantEnv = {
  indoor: boolean;
  heating: boolean;
  lightLevel: LightLevel;
};

const BASE_DAYS: Record<WaterPreference, number> = {
  low: 10,
  medium: 7,
  high: 4,
};

export function computeWaterIntervalDays(
  preference: WaterPreference,
  env: PlantEnv
): number {
  let days = BASE_DAYS[preference];
  if (env.indoor) days *= 1.05;
  if (env.heating) days *= 0.9;
  if (env.lightLevel === "high") days *= 0.95;
  if (env.lightLevel === "low") days *= 1.05;
  return Math.max(2, Math.floor(days));
}

/** Multiplier applied to *interval days*; values < 1 mean water more often (shorter interval). */
export function weatherIntervalMultiplier(
  w: WeatherSnapshot | null | undefined
): number {
  if (!w) return 1;
  let m = 1;
  if (w.relativeHumidity < 35) m *= 0.93;
  if (w.relativeHumidity > 78) m *= 1.07;
  if (w.temperatureC > 30) m *= 0.94;
  if (w.temperatureC < 5) m *= 1.05;
  return Math.min(1.12, Math.max(0.88, m));
}

export function applyWeatherToIntervalDays(
  baseIntervalDays: number,
  w?: WeatherSnapshot | null
): number {
  const m = weatherIntervalMultiplier(w);
  return Math.max(2, Math.floor(baseIntervalDays * m));
}

/** Fertilize less often than water; derived from current water cadence (days), clamped. */
export function computeFertilizeIntervalDays(waterIntervalDays: number): number {
  const scaled = Math.floor(waterIntervalDays * 4);
  return Math.max(14, Math.min(60, scaled));
}

export type GeneratedWaterTask = {
  plantId: string;
  dueDate: Date;
};

export function generateWaterTasks(input: {
  asOf: Date;
  intervalDays: number;
  horizonDays: number;
  plantId: string;
}): GeneratedWaterTask[] {
  const { asOf, intervalDays, horizonDays, plantId } = input;
  const tasks: GeneratedWaterTask[] = [];
  const start = startOfUtcDay(asOf);
  let cursor = new Date(start);
  const end = addDays(start, horizonDays);
  while (cursor < end) {
    tasks.push({ plantId, dueDate: new Date(cursor) });
    cursor = addDays(cursor, intervalDays);
  }
  return tasks;
}

/** Same horizon rule as {@link generateWaterTasks}, using the fertilize interval (days). */
export function generateFertilizeTasks(input: {
  asOf: Date;
  intervalDays: number;
  horizonDays: number;
  plantId: string;
}): GeneratedWaterTask[] {
  return generateWaterTasks(input);
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}
