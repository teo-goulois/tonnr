import { Badge } from "@repo/ui/components/ui/badge";
import { Slider } from "@repo/ui/components/ui/slider";
import { cn } from "@repo/ui/lib/utils";
import type { ReactNode } from "react";

import { MorphText } from "@/components/shared/morph-text";

// The pieces every demo of a guide is made of: a card, a line that reads the figure and judges
// it, a slider the reader moves, and a line that says what to do with it. A demo is drawn by the
// server at its starting value and changes under the reader's hand: nothing of it moves by
// itself, so a reader who asked for no motion loses nothing. Decision 060.

/** The card of a demo, on the page's second color. */
export function Demo({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("grid gap-s rounded-(--radius-s) bg-neutral-2 p-m sm:p-l", className)}>
      {children}
    </div>
  );
}

/** The drawing of a demo: an SVG as wide as the card, on the page's own color. */
export function Scene({
  viewBox,
  className,
  children,
}: {
  viewBox: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <svg
      viewBox={viewBox}
      aria-hidden
      className={cn("block h-auto w-full rounded-(--radius-xs) bg-neutral-1", className)}
    >
      {children}
    </svg>
  );
}

/** What the demo reads at its value: a figure, set in the darker type, and a verdict beside it. */
export function Readout({
  figure,
  verdict,
  children,
}: {
  figure: ReactNode;
  verdict?: ReactNode;
  // What stands at the end of the line, such as the choice of a unit.
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-m gap-y-xs">
      <span className="font-medium text-neutral-10 tabular-nums">{figure}</span>
      <span className="flex flex-wrap items-center gap-xs">
        {verdict && <Badge>{verdict}</Badge>}
        {children}
      </span>
    </div>
  );
}

/** A figure that moves to what it becomes under the slider. */
export function Moving({ children }: { children: string }) {
  return <MorphText>{children}</MorphText>;
}

/** One thing the reader changes: its name, the figure it is at, and the slider. */
export function Control({
  label,
  value,
  text,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  // The value in words, for the reader of a screen reader and beside the name.
  text: string;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="grid gap-xxs">
      <div className="flex items-baseline justify-between gap-s text-s">
        <span className="text-neutral-7">{label}</span>
        <span className="font-medium text-neutral-10 tabular-nums">
          <Moving>{text}</Moving>
        </span>
      </div>
      <Slider
        value={value}
        min={min}
        max={max}
        step={step}
        onValueChange={(next) => onChange(Array.isArray(next) ? next[0]! : next)}
        getAriaLabel={() => label}
        getAriaValueText={() => text}
      />
    </div>
  );
}

/** What to do with the demo, under it. */
export function Hint({ children }: { children: ReactNode }) {
  return <p className="text-s text-neutral-7 text-pretty">{children}</p>;
}

/** A coordinate written in an SVG: rounded, so that the server and the browser write the same page. */
export const rounded = (value: number) => Math.round(value * 100) / 100;

/** The point at a bearing, clockwise from north, and a distance from a center. */
export function at(cx: number, cy: number, degrees: number, radius: number) {
  const radians = (degrees * Math.PI) / 180;
  return {
    x: rounded(cx + radius * Math.sin(radians)),
    y: rounded(cy - radius * Math.cos(radians)),
  };
}

/** An arrow that goes the way something from `fromDegrees` goes, through a center. */
export function Arrow({
  cx,
  cy,
  fromDegrees,
  length,
  color,
}: {
  cx: number;
  cy: number;
  fromDegrees: number;
  length: number;
  color: string;
}) {
  const head = at(cx, cy, fromDegrees + 180, length);
  const tail = at(cx, cy, fromDegrees, length);
  return (
    <g>
      <line
        x1={tail.x}
        y1={tail.y}
        x2={head.x}
        y2={head.y}
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
      />
      <polygon
        points="0,-7 5,3 -5,3"
        transform={`translate(${head.x} ${head.y}) rotate(${fromDegrees + 180})`}
        fill={color}
      />
    </g>
  );
}

/** An arc of a circle from one bearing to another, clockwise, for a window. */
export function arcPath(cx: number, cy: number, radius: number, from: number, to: number) {
  const start = at(cx, cy, from, radius);
  const end = at(cx, cy, to, radius);
  const sweep = (((to - from) % 360) + 360) % 360;
  return `M${start.x} ${start.y}A${radius} ${radius} 0 ${sweep > 180 ? 1 : 0} 1 ${end.x} ${end.y}`;
}

/**
 * A coast seen from above, for the demos that turn a swell or a wind in front of it: the land on
 * the right, so that the beach faces west, and the north at the top.
 */
export function Coast({ landWord }: { landWord: string }) {
  return (
    <g>
      <path
        d="M230 0C210 40 250 80 225 120C210 150 240 170 240 170L320 170L320 0Z"
        className="fill-neutral-4"
      />
      <path
        d="M230 0C210 40 250 80 225 120C210 150 240 170 240 170"
        className="stroke-neutral-6"
        fill="none"
      />
      <text x={275} y={90} fontSize={10} textAnchor="middle" className="fill-neutral-7">
        {landWord}
      </text>
      <text x={10} y={14} fontSize={10} className="fill-neutral-7">
        N ↑
      </text>
    </g>
  );
}

/** Whether a bearing lies in a window, clockwise from one bearing to another. */
export function within(degrees: number, from: number, to: number) {
  const turn = (((degrees - from) % 360) + 360) % 360;
  const width = (((to - from) % 360) + 360) % 360;
  return turn <= width;
}
