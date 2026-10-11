import { type PointerEvent as ReactPointerEvent, useRef } from "react";

import { compassPoint } from "@/lib/format";
import { m } from "@/paraglide/messages.js";

import { Bearing } from "../viewer/bearing";
import type { Arc } from "./alert-words";

// The dial is drawn at its own size, so that its letters are the theme's.
const SIZE = 176;
const RADIUS = 66;
// A handle moves by this many degrees, dragged or with the arrows.
const STEP = 5;

const position = (degrees: number, radius: number) => {
  const angle = (degrees * Math.PI) / 180;
  return { x: radius * Math.sin(angle), y: -radius * Math.cos(angle) };
};
const onCompass = (degrees: number) => ((degrees % 360) + 360) % 360;
// Where a handle that moves comes to rest: on one of the dial's steps.
const onStep = (degrees: number) => onCompass(Math.round(degrees / STEP) * STEP);

type CompassDialProps = {
  // The sector, clockwise from `from` to `to`. Equal ends are the whole compass.
  arc: Arc;
  // Where the swell or the wind comes from at this hour, as a mark on the rim.
  now?: number | null;
  label: string;
  onChange: (arc: Arc) => void;
};

/** A sector of the compass, with a handle at each end to drag or to move with the arrows. */
export function CompassDial({ arc, now, label, onChange }: CompassDialProps) {
  const svg = useRef<SVGSVGElement>(null);
  // The ends as they are kept: only a handle that moves is brought to a step.
  const ends = { from: onCompass(arc.from), to: onCompass(arc.to) };
  const from = position(ends.from, RADIUS);
  const to = position(ends.to, RADIUS);
  const sweep = onCompass(ends.to - ends.from);
  const isWhole = sweep === 0;
  const large = sweep > 180 ? 1 : 0;

  function angleOf(event: ReactPointerEvent) {
    const box = svg.current?.getBoundingClientRect();
    if (!box) return 0;
    const dx = event.clientX - (box.left + box.width / 2);
    const dy = event.clientY - (box.top + box.height / 2);
    return onStep((Math.atan2(dx, -dy) * 180) / Math.PI);
  }
  const move = (end: "from" | "to", degrees: number) => {
    if (degrees !== ends[end]) onChange({ ...ends, [end]: degrees });
  };
  function handle(end: "from" | "to") {
    const at = end === "from" ? from : to;
    return (
      <circle
        cx={at.x}
        cy={at.y}
        // Wide enough for a thumb: the circle that shows is drawn over it.
        r={20}
        role="slider"
        tabIndex={0}
        aria-label={end === "from" ? m.alert_sector_from({ label }) : m.alert_sector_to({ label })}
        aria-valuemin={0}
        aria-valuemax={359}
        aria-valuenow={Math.round(ends[end])}
        aria-valuetext={m.alert_sector_value({
          degrees: Math.round(ends[end]),
          point: compassPoint(ends[end]),
        })}
        className="peer cursor-grab fill-transparent outline-none active:cursor-grabbing"
        onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) move(end, angleOf(event));
        }}
        onKeyDown={(event) => {
          const next =
            event.key === "ArrowRight" || event.key === "ArrowUp"
              ? onStep(ends[end] + STEP)
              : event.key === "ArrowLeft" || event.key === "ArrowDown"
                ? onStep(ends[end] - STEP)
                : event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? 360 - STEP
                    : null;
          if (next === null) return;
          event.preventDefault();
          move(end, next);
        }}
      />
    );
  }
  const mark = now == null ? null : position(now, RADIUS + 12);
  const points = m.compass_points().split(",");

  return (
    <div className="grid justify-items-center gap-xxs">
      <svg
        ref={svg}
        viewBox={`${-SIZE / 2} ${-SIZE / 2} ${SIZE} ${SIZE}`}
        className="size-44 touch-none select-none"
        role="group"
        aria-label={label}
      >
        <circle r={RADIUS} className="fill-none stroke-neutral-4 [stroke-width:2]" />
        {[0, 4, 8, 12].map((index) => {
          const at = position(index * 22.5, RADIUS - 16);
          return (
            <text
              key={index}
              x={at.x}
              y={at.y}
              textAnchor="middle"
              dominantBaseline="central"
              className="fill-neutral-7 text-xxs"
            >
              {points[index]}
            </text>
          );
        })}
        {isWhole ? (
          // Equal ends take every direction: the whole compass is drawn.
          <circle r={RADIUS} className="fill-color-1-transparent stroke-color-1 [stroke-width:5]" />
        ) : (
          <>
            <path
              d={`M 0 0 L ${from.x} ${from.y} A ${RADIUS} ${RADIUS} 0 ${large} 1 ${to.x} ${to.y} Z`}
              className="fill-color-1-transparent"
            />
            <path
              d={`M ${from.x} ${from.y} A ${RADIUS} ${RADIUS} 0 ${large} 1 ${to.x} ${to.y}`}
              className="fill-none stroke-color-1 [stroke-linecap:round] [stroke-width:5]"
            />
          </>
        )}
        {mark && <circle cx={mark.x} cy={mark.y} r={4} className="fill-neutral-10" />}
        {(["from", "to"] as const).map((end) => {
          const at = end === "from" ? from : to;
          return (
            <g key={end}>
              {handle(end)}
              <circle
                cx={at.x}
                cy={at.y}
                r={9}
                className="pointer-events-none fill-neutral-1 stroke-color-1 [stroke-width:3] peer-focus-visible:[stroke-width:6]"
              />
            </g>
          );
        })}
      </svg>
      <span className="flex items-center gap-xxs text-xs text-neutral-7">
        <Bearing degrees={ends.from} />–<Bearing degrees={ends.to} />
      </span>
    </div>
  );
}
