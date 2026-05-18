import { describe, expect, it } from "vitest";
import {
  applyWeatherToIntervalDays,
  computeFertilizeIntervalDays,
  computeWaterIntervalDays,
  generateFertilizeTasks,
  generateWaterTasks,
  weatherIntervalMultiplier,
} from "./careEngine.js";

describe("computeWaterIntervalDays", () => {
  it("uses higher frequency when heating indoors", () => {
    const without = computeWaterIntervalDays("medium", {
      indoor: true,
      heating: false,
      lightLevel: "medium",
    });
    const withHeat = computeWaterIntervalDays("medium", {
      indoor: true,
      heating: true,
      lightLevel: "medium",
    });
    expect(withHeat).toBeLessThan(without);
  });
});

describe("weatherIntervalMultiplier / applyWeatherToIntervalDays", () => {
  it("returns 1 when no weather", () => {
    expect(weatherIntervalMultiplier(null)).toBe(1);
    expect(applyWeatherToIntervalDays(7, null)).toBe(7);
  });

  it("shortens interval in hot dry air", () => {
    const dryHot = { temperatureC: 32, relativeHumidity: 28 };
    expect(weatherIntervalMultiplier(dryHot)).toBeLessThan(1);
    expect(applyWeatherToIntervalDays(10, dryHot)).toBeLessThan(10);
  });

  it("lengthens interval in cool humid air", () => {
    const coolHumid = { temperatureC: 4, relativeHumidity: 82 };
    expect(weatherIntervalMultiplier(coolHumid)).toBeGreaterThan(1);
    expect(applyWeatherToIntervalDays(10, coolHumid)).toBeGreaterThan(10);
  });

  it("never goes below 2 days floor", () => {
    expect(applyWeatherToIntervalDays(2, { temperatureC: 40, relativeHumidity: 10 })).toBe(2);
  });
});

describe("computeFertilizeIntervalDays", () => {
  it("scales off water interval with floor and cap", () => {
    expect(computeFertilizeIntervalDays(7)).toBe(28);
    expect(computeFertilizeIntervalDays(2)).toBe(14);
    expect(computeFertilizeIntervalDays(20)).toBe(60);
  });
});

describe("generateFertilizeTasks", () => {
  it("uses longer spacing than water in the same horizon", () => {
    const asOf = new Date("2026-05-18T08:00:00.000Z");
    const water = generateWaterTasks({
      asOf,
      intervalDays: 7,
      horizonDays: 30,
      plantId: "p1",
    });
    const fert = generateFertilizeTasks({
      asOf,
      intervalDays: computeFertilizeIntervalDays(7),
      horizonDays: 30,
      plantId: "p1",
    });
    expect(water.length).toBeGreaterThan(fert.length);
    expect(fert.length).toBeGreaterThan(0);
  });
});

describe("generateWaterTasks", () => {
  it("creates pending tasks on interval boundaries", () => {
    const asOf = new Date("2026-05-18T08:00:00.000Z");
    const tasks = generateWaterTasks({
      asOf,
      intervalDays: 7,
      horizonDays: 14,
      plantId: "plant_1",
    });
    expect(tasks).toHaveLength(2);
    expect(tasks[0].dueDate.toISOString().slice(0, 10)).toBe("2026-05-18");
    expect(tasks[1].dueDate.toISOString().slice(0, 10)).toBe("2026-05-25");
  });
});
