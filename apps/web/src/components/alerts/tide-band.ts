import type { AlertCriteria } from "../viewer/types";

// What the editor of an alert draws of the tide: the curve at the spot over the two days ahead,
// and where on it the alert's conditions on the tide are met. It shows the tide: what an alert finds is
// decided hour by hour, by the API.

// How far ahead of now the curve runs: two days, four tides or so.
const SPAN_MS = 48 * 60 * 60 * 1000;

export type TidePoint = { time: Date; value: number };
type TideAsked = {
  range: AlertCriteria["tideHeightMeters"];
  trend: AlertCriteria["tideTrend"];
};

/** The part of a tide that the editor draws: from now, over two days. */
export function tideAhead(points: TidePoint[], now: number) {
  return points.filter((point) => {
    const time = point.time.getTime();
    return time >= now && time <= now + SPAN_MS;
  });
}

// The height at a moment, between the two points around it, and whether the tide rises there.
// Undefined before the first point and after the last.
function tideAt(points: TidePoint[], time: number) {
  const next = points.findIndex((point) => point.time.getTime() >= time);
  if (next === -1) return undefined;
  // At a point, the tide goes the way it goes from there on, as the API reads it: at its
  // height it is already falling. The last point has only the one before it to say.
  const isAt = points[next]!.time.getTime() === time;
  const from = isAt && points[next + 1] ? points[next]! : points[next - 1];
  const to = isAt && points[next + 1] ? points[next + 1]! : points[next]!;
  if (!from) return undefined;
  const span = to.time.getTime() - from.time.getTime();
  const ratio = span === 0 ? 0 : (time - from.time.getTime()) / span;
  return {
    height: from.value + (to.value - from.value) * ratio,
    // Slack water goes neither way: it meets no condition on the way the tide goes.
    trend:
      to.value > from.value
        ? ("rising" as const)
        : to.value < from.value
          ? ("falling" as const)
          : null,
  };
}

/** Whether the tide meets what an alert asks of it at a moment: its height, and its way. */
export function meetsTide(points: TidePoint[], time: number, asked: TideAsked) {
  const at = tideAt(points, time);
  if (!at) return false;
  const { range, trend } = asked;
  if (range?.min !== undefined && at.height < range.min) return false;
  if (range?.max !== undefined && at.height > range.max) return false;
  return trend === undefined || at.trend === trend;
}

/**
 * Whether the tide meets the alert's conditions at regular moments from the first point to the
 * last: what the curve is painted with, from its start to its end.
 */
export function tideSteps(points: TidePoint[], asked: TideAsked, steps: number) {
  const first = points[0]?.time.getTime();
  const last = points.at(-1)?.time.getTime();
  if (first === undefined || last === undefined || steps < 2) return [];
  return Array.from({ length: steps }, (_, step) =>
    meetsTide(points, first + (step / (steps - 1)) * (last - first), asked),
  );
}
