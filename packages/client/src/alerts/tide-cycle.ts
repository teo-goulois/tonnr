import type { TideSegment } from "@repo/config/sea-words";

// The curve an alert's editor draws one tide with, from low water to the next, in the eight
// parts it asks for: the web's `CycleDial` and the phone's draw the same curve from here. The
// curve is drawn in its own units, which each app scales to the width it has. Decision 031,
// "The tide".

/** The curve's box, in its own units: its width, its height, and where high and low water stand. */
export const TIDE_CURVE = { width: 300, height: 96, top: 14, bottom: 76 } as const;

// Where on the cycle, from 0 to 1, a rising tide stands at a part of its range: the tide is
// drawn as a cosine, so the middle stages are short and low and high water are long.
const at = (part: number) => Math.acos(1 - 2 * part) / (2 * Math.PI);

/** The stretches of the curve each part of the cycle takes, from 0 to 1. Low water is at both ends. */
export const TIDE_SPANS: Record<TideSegment, [number, number][]> = {
  low: [
    [0, at(0.2)],
    [1 - at(0.2), 1],
  ],
  mid_low_rising: [[at(0.2), at(0.4)]],
  mid_rising: [[at(0.4), at(0.6)]],
  mid_high_rising: [[at(0.6), at(0.8)]],
  high: [[at(0.8), 1 - at(0.8)]],
  mid_high_falling: [[1 - at(0.8), 1 - at(0.6)]],
  mid_falling: [[1 - at(0.6), 1 - at(0.4)]],
  mid_low_falling: [[1 - at(0.4), 1 - at(0.2)]],
};

/** The path of a stretch of the curve, in the curve's units. */
export function tidePath([from, to]: [number, number]) {
  const { width, top, bottom } = TIDE_CURVE;
  const steps = 16;
  const points = Array.from({ length: steps + 1 }, (_, step) => {
    const t = from + ((to - from) * step) / steps;
    const height = (1 - Math.cos(2 * Math.PI * t)) / 2;
    return `${(t * width).toFixed(1)},${(bottom - height * (bottom - top)).toFixed(1)}`;
  });
  return `M${points.join("L")}`;
}
