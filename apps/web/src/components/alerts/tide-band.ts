// The tide at a spot over the two days ahead, which the editor of an alert reads how long the
// parts of the cycle it asks last on.

// How far ahead of now the curve runs: two days, four tides or so.
const SPAN_MS = 48 * 60 * 60 * 1000;

export type TidePoint = { time: Date; value: number };

/** The part of a tide that the editor draws: from now, over two days. */
export function tideAhead(points: TidePoint[], now: number) {
  return points.filter((point) => {
    const time = point.time.getTime();
    return time >= now && time <= now + SPAN_MS;
  });
}
