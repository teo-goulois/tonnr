import type { ReadingInput } from "./provider";

type Measurement = Exclude<keyof ReadingInput, "providerStationId" | "observedAt" | "validated">;

// What the sea and the wind can actually do, with a wide margin. A value outside its range is a
// provider glitch, and one too large for the database column would fail the whole snapshot.
const RANGES: Record<Measurement, readonly [min: number, max: number]> = {
  significantHeightM: [0, 30],
  maxHeightM: [0, 50],
  peakPeriodS: [0, 40],
  meanPeriodS: [0, 40],
  significantPeriodS: [0, 40],
  peakDirectionDeg: [0, 360],
  directionalSpreadDeg: [0, 360],
  waterTemperatureC: [-5, 45],
  windSpeedMs: [0, 120],
  windGustMs: [0, 120],
  windDirectionDeg: [0, 360],
};

/** Whether a value is one the measurement can take. */
export function isPlausible(measurement: Measurement, value: number) {
  const [min, max] = RANGES[measurement];
  return Number.isFinite(value) && value >= min && value <= max;
}

export function isPosition(latitude: number, longitude: number) {
  return Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
}
