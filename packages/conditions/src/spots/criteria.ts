import type { SpotCriteria } from "@repo/db/schema/spots";
import { z } from "zod";

function range(min: number, max: number) {
  return z
    .object({
      min: z.number().min(min).max(max).optional(),
      max: z.number().min(min).max(max).optional(),
    })
    .refine(
      (value) => value.min === undefined || value.max === undefined || value.min <= value.max,
      {
        message: "min must not be greater than max",
      },
    );
}

const arc = z.object({
  from: z.number().min(0).max(360),
  to: z.number().min(0).max(360),
});

export const criteriaSchema = z.strictObject({
  swellHeightMeters: range(0, 30).optional(),
  swellPeriodSeconds: range(0, 40).optional(),
  swellDirectionDegrees: arc.optional(),
  windSpeedMetersPerSecond: range(0, 120).optional(),
  windDirectionDegrees: arc.optional(),
  tideHeightMeters: range(-5, 20).optional(),
  tideTrend: z.enum(["rising", "falling"]).optional(),
}) satisfies z.ZodType<SpotCriteria>;

/** What is known about the sea at a spot for one hour. Null is a value nobody could give. */
export type HourConditions = {
  time: Date;
  swellHeightMeters: number | null;
  swellPeriodSeconds: number | null;
  swellDirectionDegrees: number | null;
  windSpeedMetersPerSecond: number | null;
  windDirectionDegrees: number | null;
  tideHeightMeters: number | null;
  tideTrend: "rising" | "falling" | null;
};

type Criterion = keyof SpotCriteria;

function isInRange(value: number | null, { min, max }: { min?: number; max?: number }) {
  return (
    value !== null && (min === undefined || value >= min) && (max === undefined || value <= max)
  );
}

/** Whether a direction lies in the sector that runs clockwise from `from` to `to`. */
export function isInArc(degrees: number | null, { from, to }: { from: number; to: number }) {
  if (degrees === null) return false;
  const direction = ((degrees % 360) + 360) % 360;
  const start = from % 360;
  const end = to % 360;
  // A sector whose two ends meet covers the whole compass.
  if (start === end) return true;
  return start < end
    ? direction >= start && direction <= end
    : direction >= start || direction <= end;
}

/**
 * The criteria an hour does not meet. An empty list means the spot works at that hour.
 * A criterion on a value that is unknown counts as not met.
 */
export function unmetCriteria(hour: HourConditions, criteria: SpotCriteria): Criterion[] {
  const unmet: Criterion[] = [];
  const check = (criterion: Criterion, met: boolean) => {
    if (!met) unmet.push(criterion);
  };

  if (criteria.swellHeightMeters) {
    check("swellHeightMeters", isInRange(hour.swellHeightMeters, criteria.swellHeightMeters));
  }
  if (criteria.swellPeriodSeconds) {
    check("swellPeriodSeconds", isInRange(hour.swellPeriodSeconds, criteria.swellPeriodSeconds));
  }
  if (criteria.swellDirectionDegrees) {
    check(
      "swellDirectionDegrees",
      isInArc(hour.swellDirectionDegrees, criteria.swellDirectionDegrees),
    );
  }
  if (criteria.windSpeedMetersPerSecond) {
    check(
      "windSpeedMetersPerSecond",
      isInRange(hour.windSpeedMetersPerSecond, criteria.windSpeedMetersPerSecond),
    );
  }
  if (criteria.windDirectionDegrees) {
    check(
      "windDirectionDegrees",
      isInArc(hour.windDirectionDegrees, criteria.windDirectionDegrees),
    );
  }
  if (criteria.tideHeightMeters) {
    check("tideHeightMeters", isInRange(hour.tideHeightMeters, criteria.tideHeightMeters));
  }
  if (criteria.tideTrend) {
    check("tideTrend", hour.tideTrend === criteria.tideTrend);
  }

  return unmet;
}

/**
 * Whether the tide is rising or falling at a moment: it rises toward the next high water and
 * falls toward the next low water. Comparing two heights an hour apart would get it wrong around
 * a turn of the tide. Null when no later tide is known.
 */
export function tideTrendAt(time: Date, extremes: readonly { time: Date; type: "high" | "low" }[]) {
  const next = extremes.find((extreme) => extreme.time > time);
  if (!next) return null;
  return next.type === "high" ? ("rising" as const) : ("falling" as const);
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * The periods during which every hour works. `hours` are consecutive and one hour apart, and a
 * window ends one hour after its last working hour.
 */
export function findWindows(hours: { time: Date; unmet: readonly Criterion[] }[]) {
  const windows: { start: Date; end: Date }[] = [];
  let start: Date | null = null;
  let previous: Date | null = null;

  for (const hour of hours) {
    const works = hour.unmet.length === 0;
    const follows = previous !== null && hour.time.getTime() - previous.getTime() === HOUR_MS;

    if (start && previous && (!works || !follows)) {
      windows.push({ start, end: new Date(previous.getTime() + HOUR_MS) });
      start = null;
    }
    if (works && !start) start = hour.time;
    previous = works ? hour.time : null;
  }
  if (start && previous) windows.push({ start, end: new Date(previous.getTime() + HOUR_MS) });

  return windows;
}
