// PROTOTYPE, to throw away. See spot-editor-prototype.tsx.

import { cn } from "@repo/ui/lib/utils";
import { type PointerEvent as ReactPointerEvent, useRef } from "react";

import {
  type Arc,
  type Draft,
  type Judged,
  type Point,
  type Window,
  arcWords,
  clockOf,
  dayOf,
  isAnnounced,
  t,
} from "./shared";

const position = (degrees: number, radius: number) => {
  const angle = (degrees * Math.PI) / 180;
  return { x: radius * Math.sin(angle), y: -radius * Math.cos(angle) };
};

/**
 * A sector of the compass with two handles to drag. `now` is where the swell or the wind comes
 * from at this hour, drawn as a mark on the rim.
 */
export function CompassDial({
  arc,
  now,
  label,
  size = 136,
  onChange,
}: {
  arc: Arc;
  now?: number | null;
  label: string;
  size?: number;
  onChange: (arc: Arc) => void;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const radius = 38;
  const from = position(arc.from, radius);
  const to = position(arc.to, radius);
  const sweep = (arc.to - arc.from + 360) % 360 || 360;

  function angleOf(event: ReactPointerEvent) {
    const box = svg.current!.getBoundingClientRect();
    const dx = event.clientX - (box.left + box.width / 2);
    const dy = event.clientY - (box.top + box.height / 2);
    const degrees = (Math.atan2(dx, -dy) * 180) / Math.PI;
    return (Math.round(degrees / 5) * 5 + 360) % 360;
  }
  function handle(end: "from" | "to") {
    const at = end === "from" ? from : to;
    return (
      <circle
        cx={at.x}
        cy={at.y}
        r={5.5}
        role="slider"
        tabIndex={0}
        aria-label={`${label}: ${end === "from" ? t("from", "de") : t("to", "à")}`}
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={arc[end]}
        className="cursor-grab fill-background stroke-neutral-10 [stroke-width:2] outline-none focus-visible:stroke-ring active:cursor-grabbing"
        onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            onChange({ ...arc, [end]: angleOf(event) });
          }
        }}
        onKeyDown={(event) => {
          const step = event.key === "ArrowRight" ? 5 : event.key === "ArrowLeft" ? -5 : 0;
          if (step) onChange({ ...arc, [end]: (arc[end] + step + 360) % 360 });
        }}
      />
    );
  }
  const mark = now == null ? null : position(now, radius + 7);

  return (
    <div className="grid justify-items-center gap-xxs">
      <svg
        ref={svg}
        viewBox="-50 -50 100 100"
        width={size}
        height={size}
        className="touch-none select-none"
        role="group"
        aria-label={label}
      >
        <circle r={radius} className="fill-none stroke-neutral-4 [stroke-width:1.5]" />
        {["N", "E", "S", "W"].map((letter, index) => {
          const at = position(index * 90, radius - 9);
          return (
            <text
              key={letter}
              x={at.x}
              y={at.y}
              textAnchor="middle"
              dominantBaseline="central"
              className="fill-neutral-7 text-[7px]"
            >
              {letter}
            </text>
          );
        })}
        <path
          d={`M 0 0 L ${from.x} ${from.y} A ${radius} ${radius} 0 ${sweep > 180 ? 1 : 0} 1 ${to.x} ${to.y} Z`}
          className="fill-success-transparent"
        />
        <path
          d={`M ${from.x} ${from.y} A ${radius} ${radius} 0 ${sweep > 180 ? 1 : 0} 1 ${to.x} ${to.y}`}
          className="fill-none stroke-success [stroke-linecap:round] [stroke-width:3]"
        />
        {mark && <circle cx={mark.x} cy={mark.y} r={2.5} className="fill-neutral-10" />}
        {handle("from")}
        {handle("to")}
      </svg>
      <span className="text-xs text-neutral-7 tabular-nums">{arcWords(arc)}</span>
    </div>
  );
}

/** The hours ahead as one strip: an hour that works is filled, and a day starts at a gap. */
export function HourStrip({ judged, className }: { judged: Judged; className?: string }) {
  const days = new Map<string, Judged["hours"]>();
  for (const hour of judged.hours) {
    const day = hour.time.toDateString();
    days.set(day, [...(days.get(day) ?? []), hour]);
  }
  return (
    <div className={cn("flex gap-[3px]", className)}>
      {[...days.entries()].map(([day, hours]) => (
        <div key={day} className="grid min-w-0 gap-xxs" style={{ flex: hours.length }}>
          <div className="flex h-4 overflow-hidden rounded-[3px] bg-neutral-3">
            {hours.map((hour) => (
              <span
                key={hour.time.getTime()}
                className={cn("flex-1", hour.unmet.length === 0 && "bg-success")}
              />
            ))}
          </div>
          <span className="truncate text-xxs text-neutral-7">{dayOf(hours[0]!.time)}</span>
        </div>
      ))}
    </div>
  );
}

export function windowWords(window: Window) {
  return `${dayOf(window.start)} · ${clockOf(window.start)}–${clockOf(window.end)}`;
}

/** How many windows an alert would announce, in words. */
export function countWords(judged: Judged) {
  const count = judged.windows.filter(isAnnounced).length;
  if (judged.hours.length === 0) return t("No forecast for this point.", "Pas de prévision ici.");
  const days = Math.max(1, Math.round(judged.hours.length / 24));
  if (count === 0) {
    return t(`No window in the next ${days} days.`, `Aucune fenêtre dans les ${days} jours.`);
  }
  return t(
    `${count} window${count > 1 ? "s" : ""} in the next ${days} days.`,
    `${count} fenêtre${count > 1 ? "s" : ""} dans les ${days} jours.`,
  );
}

/**
 * What saving would send, shown as it is: a prototype saves nothing, and this is the state that
 * a variant must be able to reach.
 */
export function DraftState({
  draft,
  point,
  breakId,
}: {
  draft: Draft;
  point: Point | null;
  breakId: string | undefined;
}) {
  const body = {
    ...(breakId ? { breakId } : { latitude: point?.latitude, longitude: point?.longitude }),
    name: draft.name,
    visibility: draft.visibility,
    alertsEnabled: draft.alertsEnabled,
    criteria: draft.criteria,
  };
  return (
    <details className="rounded-(--radius-xs) bg-neutral-2 p-s font-mono text-xxs text-neutral-8">
      <summary className="cursor-pointer select-none">POST /v1/spots</summary>
      <pre className="mt-xs overflow-x-auto whitespace-pre-wrap">
        {JSON.stringify(body, null, 2)}
      </pre>
    </details>
  );
}
