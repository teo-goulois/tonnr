import { DAY_MS, HOUR_MS, type Sample, valueAt } from "./samples";

const MINUTE_MS = 60 * 1000;

// The days of readings a station's panel opens with, and the most it asks for.
export const HISTORY_DAYS = 2;
export const HISTORY_DAYS_MOST = 7;

export type WindRangeKey = "hours" | "day" | "days" | "week";

/**
 * A span of the wind to read, and the step it is read by. A station reports every few minutes:
 * six hours keep each reading, and a longer span takes the wind by the quarter of an hour, by
 * the half hour or by the hour.
 */
export type WindRange = {
  key: WindRangeKey;
  span: number;
  step: number;
  // The days of readings the span needs.
  days: number;
};

export const WIND_RANGES: Record<WindRangeKey, WindRange> = {
  hours: { key: "hours", span: 6 * HOUR_MS, step: 6 * MINUTE_MS, days: HISTORY_DAYS },
  day: { key: "day", span: DAY_MS, step: 12 * MINUTE_MS, days: HISTORY_DAYS },
  days: { key: "days", span: 2 * DAY_MS, step: 30 * MINUTE_MS, days: HISTORY_DAYS },
  week: { key: "week", span: 7 * DAY_MS, step: HOUR_MS, days: HISTORY_DAYS_MOST },
};

// The model is drawn as far ahead as the span reaches back, and two days at most: a week of
// measurements is read for what the wind did, not for what it will do in a week.
const AHEAD_MOST = 2 * DAY_MS;

/** How far past now a span is drawn, for the model's wind to come. */
export function aheadOf(range: WindRange) {
  return Math.min(range.span, AHEAD_MOST);
}

/**
 * The wind at one moment of a span. Where the station measured, the mean speed of the step, its
 * strongest gust, and where the wind came from. Everywhere the model reaches, what it says.
 */
export type WindRow = {
  time: number;
  // In knots.
  wind: number | null;
  gust: number | null;
  // The model's wind at that moment. Null where the forecast does not reach.
  model: number | null;
  // Where the wind came from: by the station where it measured, by the model elsewhere.
  direction: number | null;
};

// A station silent for longer than this breaks the curve. A station that reports every hour
// keeps one.
const SILENCE_MS = 90 * MINUTE_MS;

/**
 * The bearing a set of bearings points to on average. 350° and 10° give north, not south: each
 * one is a point on a circle, and the answer is the bearing of their middle. Null when they
 * cancel out, as a north and a south do.
 */
export function meanBearing(bearings: number[]) {
  let east = 0;
  let north = 0;
  for (const bearing of bearings) {
    east += Math.sin((bearing * Math.PI) / 180);
    north += Math.cos((bearing * Math.PI) / 180);
  }
  if (bearings.length === 0 || Math.hypot(east, north) / bearings.length < 0.01) return null;
  return ((Math.atan2(east, north) * 180) / Math.PI + 360) % 360;
}

/**
 * The readings between two moments, one row for each step that has any: the mean of its wind
 * speeds, the strongest of its gusts, and the mean of its bearings. A row without values stands
 * where the station said nothing for a while, so that the curve stops there.
 */
export function windRows(samples: Sample[], start: number, end: number, step: number) {
  const steps = new Map<number, Sample[]>();
  for (const sample of samples) {
    if (sample.time < start || sample.time > end || sample.wind === null) continue;
    const at = Math.floor(sample.time / step);
    const held = steps.get(at);
    if (held) held.push(sample);
    else steps.set(at, [sample]);
  }

  const silence = Math.max(3 * step, SILENCE_MS);
  const rows: WindRow[] = [];
  for (const at of [...steps.keys()].sort((a, b) => a - b)) {
    const held = steps.get(at)!;
    const mean = (values: number[]) =>
      values.reduce((sum, value) => sum + value, 0) / values.length;
    const gusts = held.flatMap((sample) => (sample.gust === null ? [] : [sample.gust]));
    const row = {
      // A row stands at the start of its step, which is the reading's own moment when the step
      // is the station's.
      time: Math.max(start, at * step),
      wind: mean(held.map((sample) => sample.wind!)),
      gust: gusts.length > 0 ? Math.max(...gusts) : null,
      model: null,
      direction: meanBearing(
        held.flatMap((sample) => (sample.windDirection === null ? [] : [sample.windDirection])),
      ),
    };
    const previous = rows.at(-1);
    if (previous && row.time - previous.time > silence) {
      rows.push({
        time: (previous.time + row.time) / 2,
        wind: null,
        gust: null,
        model: null,
        direction: null,
      });
    }
    rows.push(row);
  }
  return rows;
}

/**
 * The rows of a station with the model's wind beside them: what the model says at each row,
 * then the model's own hours before the first measurement and after the last one, as far as
 * the span goes. No hour of the model is put between two measurements, where it would cut the
 * station's curve in two.
 */
export function withModel(rows: WindRow[], model: Sample[], start: number, end: number) {
  const measured = rows.filter((row) => row.wind !== null);
  const first = measured[0]?.time ?? Infinity;
  const last = measured.at(-1)?.time ?? -Infinity;

  const beside = rows.map((row) => ({
    ...row,
    model: valueAt(model, "wind", row.time, HOUR_MS) ?? null,
  }));
  const alone = model.flatMap((sample) =>
    sample.wind !== null &&
    sample.time >= start &&
    sample.time <= end &&
    (sample.time < first || sample.time > last)
      ? [
          {
            time: sample.time,
            wind: null,
            gust: null,
            model: sample.wind,
            direction: sample.windDirection,
          },
        ]
      : [],
  );
  return [...beside, ...alone].sort((a, b) => a.time - b.time);
}

/** The strongest gust of the rows, with its moment, and the mean of their wind. */
export function windSummary(rows: WindRow[]) {
  let strongest: { value: number; time: number } | undefined;
  let sum = 0;
  let count = 0;
  for (const row of rows) {
    if (row.wind !== null) {
      sum += row.wind;
      count += 1;
    }
    if (row.gust !== null && (!strongest || row.gust > strongest.value)) {
      strongest = { value: row.gust, time: row.time };
    }
  }
  return { strongest, mean: count > 0 ? sum / count : undefined };
}

/**
 * Where the wind came from along a span cut into equal parts, one bearing for each part: the
 * mean of the rows that fall in it. Null for a part without a bearing.
 */
export function bearingsAlong(rows: WindRow[], start: number, end: number, parts: number) {
  const width = (end - start) / parts;
  return Array.from({ length: parts }, (_, index) => {
    const from = start + index * width;
    return meanBearing(
      rows.flatMap((row) =>
        row.direction !== null && row.time >= from && row.time < from + width
          ? [row.direction]
          : [],
      ),
    );
  });
}

/** The row nearest a moment among those that hold a wind speed, the station's or the model's. */
export function rowNear(rows: WindRow[], time: number) {
  let nearest: WindRow | undefined;
  for (const row of rows) {
    if (row.wind === null && row.model === null) continue;
    if (!nearest || Math.abs(row.time - time) < Math.abs(nearest.time - time)) nearest = row;
  }
  return nearest;
}
