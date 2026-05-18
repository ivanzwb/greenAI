export type WaterPreference = "low" | "medium" | "high";
export type LightLevel = "low" | "medium" | "high";
export type SoilMoistureHint =
  | "very_wet"
  | "wet"
  | "moderate"
  | "dry"
  | "very_dry";

/** Current outdoor-ish conditions + optional near-term precip signal from daily forecast. */
export type WeatherSnapshot = {
  temperatureC: number;
  relativeHumidity: number;
  /**
   * 0..1 — how wet the next few days look in aggregate (from forecast prob + mm).
   * Higher → slightly lengthen watering interval (rain likely).
   */
  upcomingWetBias?: number;
  /**
   * 0..1 — sustained dry outlook (low rain on each day + optional heat).
   * Higher → slightly shorten watering interval.
   */
  upcomingDryBias?: number;
};

export type DailyPrecipHint = {
  precipitationProbabilityMax: number | null;
  precipitationSumMm: number | null;
  /** Daily max °C when available (Open-Meteo `temperature_2m_max`). */
  tempMaxC?: number | null;
};

export type PlantEnv = {
  indoor: boolean;
  heating: boolean;
  lightLevel: LightLevel;
  /** User self-report: how dry the soil feels; nudges watering interval only. */
  soilMoistureHint?: SoilMoistureHint | null;
};

const BASE_DAYS: Record<WaterPreference, number> = {
  low: 10,
  medium: 7,
  high: 4,
};

const SOIL_INTERVAL_MULT: Record<SoilMoistureHint, number> = {
  very_wet: 1.12,
  wet: 1.06,
  moderate: 1,
  dry: 0.92,
  very_dry: 0.86,
};

/** Multiplier on interval days from self-reported soil moisture (wetter → longer interval). */
export function soilMoistureIntervalMultiplier(
  hint: SoilMoistureHint | null | undefined
): number {
  if (!hint) return 1;
  return SOIL_INTERVAL_MULT[hint];
}

export function computeWaterIntervalDays(
  preference: WaterPreference,
  env: PlantEnv
): number {
  let days = BASE_DAYS[preference];
  if (env.indoor) days *= 1.05;
  if (env.heating) days *= 0.9;
  if (env.lightLevel === "high") days *= 0.95;
  if (env.lightLevel === "low") days *= 1.05;
  days = Math.max(2, Math.floor(days));
  const soil = soilMoistureIntervalMultiplier(env.soilMoistureHint ?? null);
  return Math.max(2, Math.floor(days * soil));
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

/** Map next-day(s) precip hints to 0..1 for {@link WeatherSnapshot.upcomingWetBias}. */
export function forecastWetBiasFromDaily(
  days: readonly DailyPrecipHint[]
): number {
  if (!days.length) return 0;
  let max = 0;
  for (const d of days) {
    const p = Math.max(0, Math.min(100, d.precipitationProbabilityMax ?? 0)) / 100;
    const mm = Math.max(0, d.precipitationSumMm ?? 0);
    const mmPart = Math.min(1, mm / 12);
    const dayScore = Math.min(1, p * 0.62 + mmPart * 0.38);
    max = Math.max(max, dayScore);
  }
  return max;
}

/**
 * 0..1 — sustained dry outlook: penalises if any day still looks rainy (`weakest` gate).
 * Uses mean dryness with continuity weighting; optional `tempMaxC` nudges when hot.
 */
export function forecastDryBiasFromDaily(
  days: readonly DailyPrecipHint[]
): number {
  if (days.length < 2) return 0;
  const scores: number[] = [];
  for (const d of days) {
    const p = Math.max(0, Math.min(100, d.precipitationProbabilityMax ?? 0)) / 100;
    const mm = Math.max(0, d.precipitationSumMm ?? 0);
    const lowP = 1 - p;
    const lowM = 1 - Math.min(1, mm / 5);
    let s = 0.55 * lowP + 0.45 * lowM;
    if (typeof d.tempMaxC === "number" && Number.isFinite(d.tempMaxC)) {
      const heat = Math.min(1, Math.max(0, (d.tempMaxC - 28) / 14));
      s = Math.min(1, s + heat * 0.12);
    }
    scores.push(Math.min(1, Math.max(0, s)));
  }
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const weakest = Math.min(...scores);
  if (weakest < 0.38) return 0;
  return Math.min(1, Math.max(0, 0.42 * weakest + 0.58 * mean));
}

/** Multiplier from forecast dry bias; damped — shorter interval when sustained dry. */
export function forecastDryIntervalMultiplier(bias: number | undefined): number {
  if (bias == null || Number.isNaN(bias) || bias < 0.45) return 1;
  const t = Math.min(1, (bias - 0.45) / 0.55);
  return 1 - t * 0.06;
}

/** Multiplier from forecast wet bias; damped to avoid large swings. */
export function forecastIntervalMultiplier(bias: number | undefined): number {
  if (bias == null || Number.isNaN(bias) || bias < 0.08) return 1;
  const t = Math.min(1, (bias - 0.08) / 0.92);
  return 1 + t * 0.07;
}

export function applyWeatherToIntervalDays(
  baseIntervalDays: number,
  w?: WeatherSnapshot | null
): number {
  let m = weatherIntervalMultiplier(w);
  m *= forecastIntervalMultiplier(w?.upcomingWetBias);
  m *= forecastDryIntervalMultiplier(w?.upcomingDryBias);
  m = Math.min(1.15, Math.max(0.85, m));
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
