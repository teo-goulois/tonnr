// PROTOTYPE, throwaway: variant D's picture of one tide, from low water to low water, cut in
// eight parts that a press takes or leaves.

import { TIDE_COLOR } from "@/lib/sea-scales";

import { CYCLE, CYCLE_WORDS, type CycleSegment } from "./rules";

const WIDTH = 300;
const HEIGHT = 96;
const TOP = 14;
const BOTTOM = 76;

// Where on the cycle, from 0 to 1, the tide stands at a fifth of its range, rising.
const at = (part: number) => Math.acos(1 - 2 * part) / (2 * Math.PI);

const SPANS: Record<CycleSegment, [number, number][]> = {
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

export function CycleDial({
  value,
  onChange,
}: {
  value: CycleSegment[];
  onChange: (next: CycleSegment[]) => void;
}) {
  const toggle = (segment: CycleSegment) =>
    onChange(
      value.includes(segment)
        ? value.filter((one) => one !== segment)
        : CYCLE.filter((one) => one === segment || value.includes(one)),
    );
  return (
    <svg
      viewBox={`-8 0 ${WIDTH + 16} ${HEIGHT}`}
      className="w-full touch-manipulation select-none"
      role="group"
      aria-label="Moments de la marée"
    >
      <text x={0} y={HEIGHT - 4} className="fill-neutral-7 text-xxs" textAnchor="start">
        basse
      </text>
      <text x={WIDTH / 2} y={10} className="fill-neutral-7 text-xxs" textAnchor="middle">
        haute
      </text>
      <text x={WIDTH} y={HEIGHT - 4} className="fill-neutral-7 text-xxs" textAnchor="end">
        basse
      </text>
      <text x={WIDTH / 4} y={HEIGHT - 4} className="fill-neutral-7 text-xxs" textAnchor="middle">
        ↑ montante
      </text>
      <text
        x={(3 * WIDTH) / 4}
        y={HEIGHT - 4}
        className="fill-neutral-7 text-xxs"
        textAnchor="middle"
      >
        descendante ↓
      </text>
      {CYCLE.map((segment) => {
        const isOn = value.includes(segment);
        return (
          <g
            key={segment}
            role="button"
            tabIndex={0}
            aria-pressed={isOn}
            aria-label={CYCLE_WORDS[segment]}
            className="cursor-pointer outline-none"
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
