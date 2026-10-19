import { TIDE_CYCLE, type TideSegment } from "@repo/config/sea-words";

import { TIDE_COLOR } from "@/lib/sea-scales";
import { m } from "@/paraglide/messages.js";

import { SEGMENT_WORDS } from "./alert-words";

const WIDTH = 300;
const HEIGHT = 96;
const TOP = 14;
const BOTTOM = 76;

// Where on the cycle, from 0 to 1, a rising tide stands at a part of its range: the tide is
// drawn as a cosine, so the middle stages are short and low and high water are long.
const at = (part: number) => Math.acos(1 - 2 * part) / (2 * Math.PI);

// The stretches of the curve each part of the cycle takes. Low water is at both ends.
const SPANS: Record<TideSegment, [number, number][]> = {
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

function pathOf([from, to]: [number, number]) {
  const steps = 16;
  const points = Array.from({ length: steps + 1 }, (_, step) => {
    const t = from + ((to - from) * step) / steps;
    const height = (1 - Math.cos(2 * Math.PI * t)) / 2;
    return `${(t * WIDTH).toFixed(1)},${(BOTTOM - height * (BOTTOM - TOP)).toFixed(1)}`;
  });
  return `M${points.join("L")}`;
}

/**
 * One tide, from low water to the next, in the eight parts an alert asks for: a press takes a
 * part or leaves it. Decision 031, "The tide".
 */
export function CycleDial({
  value,
  onChange,
}: {
  value: readonly TideSegment[];
  onChange: (next: TideSegment[]) => void;
}) {
  const toggle = (segment: TideSegment) =>
    onChange(
      TIDE_CYCLE.filter((one) => (one === segment ? !value.includes(one) : value.includes(one))),
    );
  return (
    <svg
      viewBox={`-8 0 ${WIDTH + 16} ${HEIGHT}`}
      className="w-full touch-manipulation select-none"
      role="group"
      aria-label={m.alert_label_tide()}
    >
      <text x={0} y={HEIGHT - 4} className="fill-neutral-7 text-xxs" textAnchor="start">
        {m.alert_tide_low()}
      </text>
      <text x={WIDTH / 2} y={10} className="fill-neutral-7 text-xxs" textAnchor="middle">
        {m.alert_tide_high()}
      </text>
      <text x={WIDTH} y={HEIGHT - 4} className="fill-neutral-7 text-xxs" textAnchor="end">
        {m.alert_tide_low()}
      </text>
      <text x={WIDTH / 4} y={HEIGHT - 4} className="fill-neutral-7 text-xxs" textAnchor="middle">
        ↑ {m.alert_trend_rising()}
      </text>
      <text
        x={(3 * WIDTH) / 4}
        y={HEIGHT - 4}
        className="fill-neutral-7 text-xxs"
        textAnchor="middle"
      >
        {m.alert_trend_falling()} ↓
      </text>
      {TIDE_CYCLE.map((segment) => {
        const isOn = value.includes(segment);
        return (
          <g
            key={segment}
            role="button"
            tabIndex={0}
            aria-pressed={isOn}
            aria-label={SEGMENT_WORDS[segment]()}
            className="focus-ring cursor-pointer outline-none"
            onClick={() => toggle(segment)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                toggle(segment);
              }
            }}
          >
            {SPANS[segment].map((span) => (
              <g key={span[0]}>
                {/* A wide line that shows nothing, for a finger to find the part. */}
                <path d={pathOf(span)} stroke="transparent" strokeWidth={30} fill="none" />
                <path
                  d={pathOf(span)}
                  stroke={isOn ? TIDE_COLOR : "var(--neutral-5)"}
                  strokeWidth={isOn ? 7 : 4}
                  strokeLinecap="butt"
                  fill="none"
                />
              </g>
            ))}
          </g>
        );
      })}
    </svg>
  );
}
