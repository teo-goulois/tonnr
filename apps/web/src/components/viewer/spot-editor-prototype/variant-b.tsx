// PROTOTYPE, to throw away. See spot-editor-prototype.tsx.
//
// Variant B, "on the forecast": the week ahead is the editor. Each quantity is a lane under the
// map, and a criterion is a band drawn on its lane, dragged by its edges. An hour that worked
// can be pressed to draw every band around it.

import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Switch } from "@repo/ui/components/ui/switch";
import { XIcon } from "@repo/ui/icon";
import { cn } from "@repo/ui/lib/utils";
import { type PointerEvent as ReactPointerEvent, type ReactNode, useState } from "react";

import { countWords } from "./parts";
import {
  type Arc,
  type ArcKey,
  type CriterionKey,
  type Range,
  type RangeKey,
  KNOT,
  arcWords,
  around,
  clockOf,
  compass,
  dayOf,
  isAnnounced,
  rangeWords,
  t,
} from "./shared";
import type { EditorProps } from "./spot-editor-prototype";

const HOUR_WIDTH = 9;
const LANE_HEIGHT = 56;
const AXIS_HEIGHT = 36;
const LABEL_WIDTH = 168;

type RangeLane = {
  kind: "range";
  key: RangeKey;
  label: string;
  unit: string;
  // What the lane shows for one of what the API stores: knots for metres per second.
  scale: number;
  low: number;
  high: number;
  step: number;
  fallback: Range;
};
type ArcLane = { kind: "arc"; key: ArcKey; label: string; fallback: Arc };

// A press that holds an edge moves it until it lets go.
function drag(onMove: (event: ReactPointerEvent<SVGElement>, box: DOMRect) => void) {
  return {
    onPointerDown: (event: ReactPointerEvent<SVGElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove: (event: ReactPointerEvent<SVGElement>) => {
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
      onMove(event, event.currentTarget.ownerSVGElement!.getBoundingClientRect());
    },
  };
}

const EDGE = "cursor-ns-resize stroke-transparent [stroke-width:16]";
const LINE = "pointer-events-none stroke-success [stroke-width:1.5]";

function RangeBand({
  lane,
  values,
  range,
  ruledOut,
  width,
  onChange,
}: {
  lane: RangeLane;
  values: (number | null)[];
  range: Range | undefined;
  ruledOut: boolean[];
  width: number;
  onChange: (range: Range) => void;
}) {
  const { low, high, step, scale } = lane;
  const y = (value: number) =>
    LANE_HEIGHT - ((Math.min(high, Math.max(low, value)) - low) / (high - low)) * LANE_HEIGHT;
  const path = values
    .map((value, index) => {
      if (value === null) return "";
      const start = index === 0 || values[index - 1] === null;
      return `${start ? "M" : "L"} ${(index + 0.5) * HOUR_WIDTH} ${y(value)}`;
    })
    .join(" ");
  const top = range?.max === undefined ? 0 : y(range.max * scale);
  const bottom = range?.min === undefined ? LANE_HEIGHT : y(range.min * scale);
  // The value under the pointer, in what the API stores. An edge at the end of the lane is open.
  const at = (event: ReactPointerEvent, box: DOMRect) => {
    const share = 1 - (event.clientY - box.top) / box.height;
    const shown = Math.round((low + share * (high - low)) / step) * step;
    return Math.min(high, Math.max(low, shown));
  };
  const stored = (shown: number) => Math.round((shown / scale) * 100) / 100;

  return (
    <svg width={width} height={LANE_HEIGHT} className="block touch-none overflow-visible">
      <path d={path} className="fill-none stroke-neutral-10 [stroke-width:1.5]" />
      {ruledOut.map((out, index) =>
        out ? (
          <rect
            key={index}
            x={index * HOUR_WIDTH}
            width={HOUR_WIDTH}
            height={LANE_HEIGHT}
            className="fill-background opacity-70"
          />
        ) : null,
      )}
      {range && (
        <>
          <rect
            y={top}
            width={width}
            height={Math.max(0, bottom - top)}
            className="fill-success-transparent"
          />
          <line x2={width} y1={top} y2={top} className={LINE} />
          <line x2={width} y1={bottom} y2={bottom} className={LINE} />
          <line
            x2={width}
            y1={top}
            y2={top}
            className={EDGE}
            {...drag((event, box) => {
              const shown = Math.max(at(event, box), (range.min ?? low / scale) * scale);
              onChange({ ...range, max: shown >= high ? undefined : stored(shown) });
            })}
          />
          <line
            x2={width}
            y1={bottom}
            y2={bottom}
            className={EDGE}
            {...drag((event, box) => {
              const shown = Math.min(at(event, box), (range.max ?? high / scale) * scale);
              onChange({ ...range, min: shown <= low ? undefined : stored(shown) });
            })}
          />
        </>
      )}
    </svg>
  );
}

function ArcBand({
  values,
  arc,
  ruledOut,
  width,
  onChange,
}: {
  values: (number | null)[];
  arc: Arc | undefined;
  ruledOut: boolean[];
  width: number;
  onChange: (arc: Arc) => void;
}) {
  // North is at the top and at the bottom: the lane is the compass, unrolled clockwise.
  const y = (degrees: number) => (degrees / 360) * LANE_HEIGHT;
  const at = (event: ReactPointerEvent, box: DOMRect) => {
    const degrees = ((event.clientY - box.top) / box.height) * 360;
    return (Math.round(Math.min(360, Math.max(0, degrees)) / 5) * 5) % 360;
  };
  const bands = !arc
    ? []
    : arc.from <= arc.to
      ? [[y(arc.from), y(arc.to)]]
      : [
          [y(arc.from), LANE_HEIGHT],
          [0, y(arc.to)],
        ];

  return (
    <svg width={width} height={LANE_HEIGHT} className="block touch-none overflow-visible">
      {[90, 180, 270].map((degrees) => (
        <line
          key={degrees}
          x2={width}
          y1={y(degrees)}
          y2={y(degrees)}
          className="stroke-neutral-3 [stroke-width:1]"
        />
      ))}
      {values.map((value, index) =>
        value === null ? null : (
          <circle
            key={index}
            cx={(index + 0.5) * HOUR_WIDTH}
            cy={y(value)}
            r={1.8}
            className={ruledOut[index] ? "fill-neutral-5" : "fill-neutral-10"}
          />
        ),
      )}
      {arc && (
        <>
          {bands.map(([top, bottom]) => (
            <rect
              key={top}
              y={top}
              width={width}
              height={bottom! - top!}
              className="fill-success-transparent"
            />
          ))}
          {(["from", "to"] as const).map((end) => (
            <g key={end}>
              <line x2={width} y1={y(arc[end])} y2={y(arc[end])} className={LINE} />
              <line
                x2={width}
                y1={y(arc[end])}
                y2={y(arc[end])}
                className={EDGE}
                {...drag((event, box) => onChange({ ...arc, [end]: at(event, box) }))}
              />
            </g>
          ))}
        </>
      )}
    </svg>
  );
}

function LaneLabel({
  label,
  words,
  enabled,
  onToggle,
  children,
}: {
  label: string;
  words: string;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  children?: ReactNode;
}) {
  return (
    <div
      className="flex items-center justify-between gap-xs border-t border-neutral-3 pr-s pl-m"
      style={{ height: LANE_HEIGHT }}
    >
      <div className="grid min-w-0">
        <span className="truncate text-xs font-medium">{label}</span>
        <span className="truncate text-xxs text-neutral-7 tabular-nums">
          {enabled ? words : t("not checked", "non vérifié")}
        </span>
        {children}
      </div>
      <Switch checked={enabled} onCheckedChange={onToggle} aria-label={label} />
    </div>
  );
}

export function VariantB({
  draft,
  onDraft,
  onCriteria,
  judged,
  tide,
  place,
  footer,
  onSave,
  onClose,
}: EditorProps) {
  const { criteria } = draft;
  const { hours } = judged;
  const [hovered, setHovered] = useState<number | undefined>(undefined);
  const width = hours.length * HOUR_WIDTH;
  const most = (pick: (hour: (typeof hours)[number]) => number | null, floor: number) =>
    Math.max(floor, Math.ceil(Math.max(0, ...hours.map((hour) => pick(hour) ?? 0)) + 0.5));

  const lanes: (RangeLane | ArcLane)[] = [
    {
      kind: "range",
      key: "swellHeightMeters",
      label: t("Swell height", "Hauteur de houle"),
      unit: "m",
      scale: 1,
      low: 0,
      high: most((hour) => hour.swellHeightMeters, 3),
      step: 0.1,
      fallback: { min: 0.8, max: 2.5 },
    },
    {
      kind: "range",
      key: "swellPeriodSeconds",
      label: t("Swell period", "Période de houle"),
      unit: "s",
      scale: 1,
      low: 4,
      high: 22,
      step: 1,
      fallback: { min: 9 },
    },
    {
      kind: "arc",
      key: "swellDirectionDegrees",
      label: t("Swell from", "Houle de"),
      fallback: { from: 250, to: 310 },
    },
    {
      kind: "range",
      key: "windSpeedMetersPerSecond",
      label: t("Wind speed", "Vitesse du vent"),
      unit: t("kn", "nd"),
      scale: KNOT,
      low: 0,
      high: most((hour) => (hour.windSpeedMetersPerSecond ?? 0) * KNOT, 30),
      step: 1,
      fallback: { max: 15 / KNOT },
    },
    {
      kind: "arc",
      key: "windDirectionDegrees",
      label: t("Wind from", "Vent de"),
      fallback: { from: 45, to: 135 },
    },
    ...(tide
      ? [
          {
            kind: "range" as const,
            key: "tideHeightMeters" as const,
            label: t("Tide", "Marée"),
            unit: "m",
            scale: 1,
            low: Math.floor(tide.low * 2) / 2,
            high: Math.ceil(tide.high * 2) / 2,
            step: 0.1,
            fallback: { min: tide.low + (tide.high - tide.low) * 0.35 },
          },
        ]
      : []),
  ];
  const set = (key: CriterionKey, value: Range | Arc | undefined) =>
    onCriteria({ ...criteria, [key]: value });
  const trend = criteria.tideTrend;
  const nextTrend = trend === undefined ? "rising" : trend === "rising" ? "falling" : undefined;
  const shown = hovered === undefined ? undefined : hours[hovered];

  return (
    <div className="absolute inset-x-0 bottom-0 z-20 flex h-[min(62vh,30rem)] flex-col border-t border-neutral-4 bg-background shadow-[0_-8px_24px_rgb(0_0_0/0.12)]">
      <header className="flex flex-wrap items-center gap-s px-m pt-s">
        <Input
          className="w-56"
          value={draft.name}
          placeholder={t("Name of the spot", "Nom du spot")}
          aria-label={t("Name of the spot", "Nom du spot")}
          onChange={(event) => onDraft({ name: event.currentTarget.value })}
        />
        <span className="text-s font-medium">{countWords(judged)}</span>
        <span className="min-w-0 flex-1 truncate text-xs text-neutral-7">{place}</span>
        <label className="flex items-center gap-xs text-s">
          <Switch
            checked={draft.alertsEnabled}
            onCheckedChange={(alertsEnabled) => onDraft({ alertsEnabled })}
          />
          {t("Alert me", "M’alerter")}
        </label>
        <Button onClick={onSave}>{t("Save the spot", "Enregistrer le spot")}</Button>
        <Button variant="ghost" size="icon" aria-label={t("Close", "Fermer")} onClick={onClose}>
          <XIcon data-slot="icon" aria-hidden />
        </Button>
      </header>
      {/* What the hour under the pointer holds, and what a press on it does. */}
      <p className="h-6 truncate px-m text-xs text-neutral-7 tabular-nums">
        {shown
          ? [
              `${dayOf(shown.time)} ${clockOf(shown.time)}`,
              shown.swellHeightMeters !== null &&
                `${shown.swellHeightMeters.toFixed(1)} m ${shown.swellPeriodSeconds?.toFixed(0) ?? "–"} s ${shown.swellDirectionDegrees === null ? "" : compass(shown.swellDirectionDegrees)}`,
              shown.windSpeedMetersPerSecond !== null &&
                `${(shown.windSpeedMetersPerSecond * KNOT).toFixed(0)} ${t("kn", "nd")} ${shown.windDirectionDegrees === null ? "" : compass(shown.windDirectionDegrees)}`,
              shown.tideHeightMeters !== null &&
                `${t("tide", "marée")} ${shown.tideHeightMeters.toFixed(1)} m`,
              t("press the day's line: “like then”", "clique la ligne des jours : « comme là »"),
            ]
              .filter(Boolean)
              .join(" · ")
          : t(
              "Drag the edges of a band. Press an hour on the day's line to draw every band around it.",
              "Tire les bords d’une bande. Clique une heure sur la ligne des jours pour caler toutes les bandes dessus.",
            )}
      </p>

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="flex w-max min-w-full">
          <div className="sticky left-0 z-10 shrink-0 bg-background" style={{ width: LABEL_WIDTH }}>
            <div
              className="flex items-end px-m pb-xxs text-xxs text-neutral-7"
              style={{ height: AXIS_HEIGHT }}
            >
              {t("Works", "Marche")}
            </div>
            {lanes.map((lane) => (
              <LaneLabel
                key={lane.key}
                label={lane.label}
                words={
                  lane.kind === "range"
                    ? rangeWords(
                        criteria[lane.key] ?? {},
                        lane.unit,
                        lane.scale,
                        lane.step < 1 ? 1 : 0,
                      )
                    : criteria[lane.key]
                      ? arcWords(criteria[lane.key]!)
                      : ""
                }
                enabled={criteria[lane.key] !== undefined}
                onToggle={(enabled) => set(lane.key, enabled ? lane.fallback : undefined)}
              >
                {lane.key === "tideHeightMeters" && (
                  <button
                    type="button"
                    className="w-fit cursor-pointer text-xxs underline underline-offset-2"
                    onClick={() => onCriteria({ ...criteria, tideTrend: nextTrend })}
                  >
                    {trend === "rising"
                      ? t("rising only", "montante seulement")
                      : trend === "falling"
                        ? t("falling only", "descendante seulement")
                        : t("rising or falling", "montante ou descendante")}
                  </button>
                )}
              </LaneLabel>
            ))}
          </div>

          <div
            className="relative"
            style={{ width }}
            onPointerMove={(event) => {
              const box = event.currentTarget.getBoundingClientRect();
              const index = Math.floor((event.clientX - box.left) / HOUR_WIDTH);
              setHovered(index >= 0 && index < hours.length ? index : undefined);
            }}
            onPointerLeave={() => setHovered(undefined)}
          >
            {/* The line of the days: the windows, and an hour to press. */}
            <svg
              width={width}
              height={AXIS_HEIGHT}
              className="block cursor-pointer"
              onClick={(event) => {
                // The hour is read from the press itself: a press can come before the pointer
                // was seen to move.
                const box = event.currentTarget.getBoundingClientRect();
                const hour = hours[Math.floor((event.clientX - box.left) / HOUR_WIDTH)];
                if (hour) onCriteria(around(hour));
              }}
            >
              {hours.map((hour, index) =>
                hour.time.getHours() === 0 || index === 0 ? (
                  <g key={index}>
                    <line
                      x1={index * HOUR_WIDTH}
                      x2={index * HOUR_WIDTH}
                      y2={AXIS_HEIGHT}
                      className="stroke-neutral-4"
                    />
                    <text x={index * HOUR_WIDTH + 4} y={12} className="fill-neutral-7 text-[10px]">
                      {dayOf(hour.time)}
                    </text>
                  </g>
                ) : null,
              )}
              {judged.windows.map((window) => {
                const from = hours.findIndex(
                  (hour) => hour.time.getTime() === window.start.getTime(),
                );
                const span = (window.end.getTime() - window.start.getTime()) / (60 * 60 * 1000);
                return (
                  <rect
                    key={window.start.getTime()}
                    x={from * HOUR_WIDTH}
                    y={20}
                    width={span * HOUR_WIDTH - 1}
                    height={12}
                    rx={3}
                    // A window too short for an alert is drawn lighter.
                    className={cn("fill-success", !isAnnounced(window) && "opacity-40")}
                  />
                );
              })}
            </svg>
            {lanes.map((lane) => {
              const ruledOut = hours.map((hour) => hour.unmet.includes(lane.key));
              return (
                <div key={lane.key} className="border-t border-neutral-3">
                  {lane.kind === "range" ? (
                    <RangeBand
                      lane={lane}
                      values={hours.map((hour) => {
                        const value = hour[lane.key];
                        return value === null ? null : value * lane.scale;
                      })}
                      range={criteria[lane.key]}
                      ruledOut={ruledOut}
                      width={width}
                      onChange={(range) => set(lane.key, range)}
                    />
                  ) : (
                    <ArcBand
                      values={hours.map((hour) => hour[lane.key])}
                      arc={criteria[lane.key]}
                      ruledOut={ruledOut}
                      width={width}
                      onChange={(arc) => set(lane.key, arc)}
                    />
                  )}
                </div>
              );
            })}
            {hovered !== undefined && (
              <div
                className="pointer-events-none absolute inset-y-0 bg-neutral-10/10"
                style={{ left: hovered * HOUR_WIDTH, width: HOUR_WIDTH }}
              />
            )}
          </div>
        </div>
        <div className="p-m">{footer}</div>
      </div>
    </div>
  );
}
