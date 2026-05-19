import type { Plant, User } from "@prisma/client";
import type { PlantEnv } from "../domain/careEngine.js";

/** Assemble rule-engine env from persisted plant + user preference rows. */
export function buildPlantEnv(
  plant: Pick<
    Plant,
    | "indoor"
    | "heating"
    | "lightLevel"
    | "soilMoistureHint"
    | "waterSkipStreak"
  >,
  user: Pick<User, "airConditioning" | "windowAspect"> | null | undefined
): PlantEnv {
  return {
    indoor: plant.indoor,
    heating: plant.heating,
    lightLevel: plant.lightLevel,
    soilMoistureHint: plant.soilMoistureHint,
    waterSkipStreak: plant.waterSkipStreak,
    airConditioning: user?.airConditioning ?? false,
    windowAspect: user?.windowAspect ?? "unknown",
  };
}
