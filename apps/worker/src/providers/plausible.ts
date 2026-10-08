import type { ReadingInput } from "./provider";

export type Measurement = Exclude<
  keyof ReadingInput,
  "providerStationId" | "observedAt" | "validated"
>;

// What the sea and the wind can actually do, with a wide margin. A value outside its range is a
// provider glitch, and one the database column cannot hold would fail the whole snapshot.
const RANGES: Record<Measurement, readonly [min: number, max: number]> = {
  significantHeightM: [0, 30],
  maxHeightM: [0, 50],
  peakPeriodS: [0, 40],
  meanPeriodS: [0, 40],
  significantPeriodS: [0, 40],
  peakDirectionDeg: [0, 360],
  // A spread is a standard deviation of directions, which cannot pass 81 degrees.
  directionalSpreadDeg: [0, 90],
  waterTemperatureC: [-5, 45],
  windSpeedMs: [0, 120],
  windGustMs: [0, 120],
  windDirectionDeg: [0, 360],
};

/**
 * The value as it will be stored, or null when the measurement cannot take it.
 * No provider reports finer than a thousandth, and rounding to it turns a value too small for
 * the column, such as 1e-50, into zero.
 */
export function plausible(measurement: Measurement, value: number) {
  const [min, max] = RANGES[measurement];
  if (!Number.isFinite(value) || value < min || value > max) return null;
  return Math.round(value * 1000) / 1000;
}

export function isPosition(latitude: number, longitude: number) {
  return Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
}
