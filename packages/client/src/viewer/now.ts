import { HOUR_MS, type NumericKey, type Sample, directionAt, valueAt } from "./samples";

// What a panel reads of the sea now, in each app: a buoy's last reading while it is recent, and
// the model at that time.

// A reading older than this no longer stands for the sea now.
export const LIVE_REACH = 3 * HOUR_MS;

/** What the sea now is read from: the buoy's readings and the model's hours, oldest first. */
export type SeaRead = { measured: Sample[]; model: Sample[]; now: number };

/** What a metric reads now: the buoy's last reading when it is recent, and the model at that time. */
export function nowOf(
  metric: { key: NumericKey; direction?: "waveDirection" | "swellDirection" | "windDirection" },
  { measured, model, now }: SeaRead,
) {
  const last = measured.filter((sample) => sample[metric.key] !== null).at(-1);
  const live = last && now - last.time <= LIVE_REACH ? last : undefined;
  const at = live?.time ?? now;
  const measuredValue = live?.[metric.key] ?? undefined;
  const modelValue = valueAt(model, metric.key, at);
  const measuredBearing = live && metric.direction ? live[metric.direction] : null;
  const bearing =
    measuredBearing ?? (metric.direction ? directionAt(model, metric.direction, at) : undefined);
  return {
    measured: measuredValue,
    model: modelValue,
    shown: measuredValue ?? modelValue,
    bearing,
  };
}
