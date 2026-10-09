// PROTOTYPE: thrown away once a variant of the details panel has won. See details-prototype.tsx.

import { Button } from "@repo/ui/components/ui/button";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { cn } from "@repo/ui/lib/utils";
import {
  type PointerEvent,
  type ReactNode,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { compassPoint, formatClock, formatDay, formatMeters } from "@/lib/format";
import { TIDE_COLOR } from "@/lib/sea-scales";

import { DirectionArrow } from "../map-markers";
import { LaneCurve } from "./metric-lanes";
import {
  HOUR_MS,
  type Metric,
  type MetricKey,
  type Sample,
  cellColors,
  curvePath,
  directionAt,
  formatMetric,
  isNight,
  metrics,
  nightsBetween,
  t,
  valueAt,
} from "./metrics";

export type GridTide = {
  points: { time: number; value: number }[];
  extremes: { time: number; value: number; high: boolean }[];
};

type ForecastGridProps = {
  model: Sample[];
  // What the buoy measured, written under the model's row of the same value.
  measured?: Sample[];
  start: number;
  end: number;
  now: number;
  stepHours?: number;
  place?: { latitude: number; longitude: number };
  // The tide as a last row, drawn as a curve on the same hours.
  tide?: GridTide;
  // A curve above the rows of the swell and of the wind, on the same hours as the columns.
  curves?: boolean;
  // How many columns of the past stay in view before the one of now, when the grid opens.
  lead?: number;
  // What stands before the button that brings now back into view.
  toolbar?: ReactNode;
  isLoading?: boolean;
};

const COLUMN = 34;
const LABELS = 68;
const ROW = "h-[26px]";
const MEASURED_REACH = 1.5 * HOUR_MS;

// `day` counts the days from the first one, and `newDay` marks the first column of the others.
type Column = { time: number; night: boolean; isNow: boolean; day: number; newDay: boolean };

// A hair of the page's color before the first column of a day. A cell draws it: a column cannot.
const DAY_RULE = "shadow-[inset_1.5px_0_0_var(--neutral-1)]";

function ValueCell({
  metric,
  value,
  strong,
  rule,
}: {
  metric: Metric;
  value?: number;
  strong?: boolean;
  rule: boolean;
}) {
  return (
    <td
      className={cn(
        ROW,
        "p-0 text-center text-xs tabular-nums",
        strong && "font-medium",
        rule && DAY_RULE,
      )}
      style={value === undefined ? undefined : cellColors(metric, value)}
    >
      {value === undefined ? "" : formatMetric(metric, value, false)}
    </td>
  );
}

function RowLabel({
  children,
  unit,
  quiet,
}: {
  children: ReactNode;
  unit?: string;
  quiet?: boolean;
}) {
  return (
    <th
      scope="row"
      className={cn(
        ROW,
        "sticky left-0 z-10 bg-neutral-1 py-0 pr-xs pl-0 text-left text-xs font-normal whitespace-nowrap",
        quiet && "text-neutral-7",
      )}
    >
      {children}
      {unit && <span className="ml-1 text-neutral-6">{unit}</span>}
    </th>
  );
}

/**
 * The days ahead as a grid to scroll sideways: a column every few hours, a row for each value,
 * each cell in the color of what it says. The names of the rows stay in view.
 */
export function ForecastGrid({
  model,
  measured,
  start,
  end,
  now,
  stepHours = 3,
  place,
  tide,
  curves = false,
  lead = 0,
  toolbar,
  isLoading = false,
}: ForecastGridProps) {
  const strings = t();
  const all = metrics();
  const step = stepHours * HOUR_MS;
  const scroller = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; left: number } | null>(null);
  const [away, setAway] = useState(false);

  const columns = useMemo(() => {
    const first = new Date(start);
    first.setMinutes(0, 0, 0);
    first.setHours(Math.ceil(first.getHours() / stepHours) * stepHours);
    if (first.getTime() < start) first.setTime(first.getTime() + step);
    const list: Column[] = [];
    let previousDay = "";
    let day = -1;
    for (let time = first.getTime(); time <= end; time += step) {
      const date = new Date(time).toDateString();
      const newDay = date !== previousDay;
      if (newDay) day++;
      list.push({
        time,
        night: place ? isNight(time, place.latitude, place.longitude) : false,
        isNow: Math.abs(time - now) <= step / 2,
        day,
        newDay: newDay && day > 0,
      });
      previousDay = date;
    }
    return list;
  }, [start, end, now, step, stepHours, place]);

  const days = useMemo(() => {
    const spans: { time: number; count: number }[] = [];
    for (const column of columns) {
      const last = spans.at(-1);
      if (last && new Date(last.time).toDateString() === new Date(column.time).toDateString()) {
        last.count++;
      } else spans.push({ time: column.time, count: 1 });
    }
    return spans;
  }, [columns]);

  const nowIndex = columns.findIndex((column) => column.isNow);
  const home = Math.max(0, (nowIndex - lead) * COLUMN);

  // The grid opens with now at its left, after the columns of the past it is asked to keep.
  useLayoutEffect(() => {
    if (!isLoading && scroller.current) scroller.current.scrollLeft = home;
    // Only a new span of time moves the grid: the minutes that pass do not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, columns.length, home]);

  if (isLoading) return <Skeleton className="h-64 w-full rounded-(--radius-xs)" />;
  if (columns.length === 0) return null;

  // A mouse has no way to scroll sideways, so it drags the grid.
  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    drag.current = { x: event.clientX, left: event.currentTarget.scrollLeft };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    event.currentTarget.scrollLeft = drag.current.left - (event.clientX - drag.current.x);
  }

  const width = columns.length * COLUMN;
  // A curve lies on the same hours as the columns: each column is centered on its hour.
  const from = columns[0]!.time - step / 2;
  const to = columns.at(-1)!.time + step / 2;
  const nights = place ? nightsBetween(from, to, place.latitude, place.longitude) : [];
  const buoy = measured ?? [];
  const compares = measured !== undefined && measured.length > 0;

  function valueRow(
    key: MetricKey,
    label: ReactNode = all[key].label,
    numeric: MetricKey | "gust" = key,
  ) {
    const metric = all[key];
    return (
      <>
        <tr>
          <RowLabel unit={numeric === "gust" ? undefined : metric.unit}>{label}</RowLabel>
          {columns.map((column) => (
            <ValueCell
              key={column.time}
              metric={metric}
              rule={column.newDay}
              value={valueAt(model, numeric, column.time, step / 2)}
            />
          ))}
        </tr>
        {compares && buoy.some((sample) => sample[numeric] !== null) && (
          <tr>
            <RowLabel quiet>{strings.buoy}</RowLabel>
            {columns.map((column) => (
              <ValueCell
                key={column.time}
                metric={metric}
                strong
                rule={column.newDay}
                value={
                  column.time > now + step / 2
                    ? undefined
                    : valueAt(buoy, numeric, column.time, MEASURED_REACH)
                }
              />
            ))}
          </tr>
        )}
      </>
    );
  }

  function directionRow(key: "waveDirection" | "windDirection") {
    return (
      <tr>
        <RowLabel quiet>{strings.direction}</RowLabel>
        {columns.map((column) => {
          const bearing =
            (compares && column.time <= now
              ? directionAt(buoy, key, column.time, MEASURED_REACH)
              : undefined) ?? directionAt(model, key, column.time, step / 2);
          return (
            <td
              key={column.time}
              className={cn(ROW, "p-0 text-neutral-9", column.newDay && DAY_RULE)}
              title={bearing === undefined ? undefined : compassPoint(bearing)}
            >
              {bearing !== undefined && (
                <DirectionArrow fromDegrees={bearing} className="mx-auto size-3.5" />
              )}
            </td>
          );
        })}
      </tr>
    );
  }

  function curveRow(key: MetricKey) {
    return (
      <tr aria-hidden>
        <th className="sticky left-0 z-10 bg-neutral-1 p-0" />
        <td colSpan={columns.length} className="p-0 pt-xs">
          <LaneCurve
            metric={all[key]}
            measured={buoy}
            model={model}
            start={from}
            end={to}
            now={now}
            nights={nights}
            width={width}
            height={48}
          />
        </td>
      </tr>
    );
  }

  const spacer = (
    <tr aria-hidden>
      <td colSpan={columns.length + 1} className="h-xs p-0" />
    </tr>
  );

  return (
    <div className="grid gap-xs">
      {(toolbar !== undefined || away) && (
        <div className="flex h-7 items-center justify-between gap-xs">
          <div className="flex items-center gap-xs">{toolbar}</div>
          {away && nowIndex >= 0 && (
            <Button
              variant="secondary"
              size="xs"
              onClick={() => scroller.current?.scrollTo({ left: home, behavior: "smooth" })}
            >
              {strings.backToNow}
            </Button>
          )}
        </div>
      )}
      <div
        ref={scroller}
        className="cursor-grab overflow-x-auto overscroll-x-contain [scrollbar-width:none] active:cursor-grabbing"
        style={{
          maskImage: "linear-gradient(to right, black calc(100% - 28px), transparent)",
        }}
        onScroll={(event) => setAway(Math.abs(event.currentTarget.scrollLeft - home) > COLUMN * 2)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        <table
          className="table-fixed border-separate border-spacing-0 select-none"
          style={{ width: LABELS + width }}
        >
          <colgroup>
            <col style={{ width: LABELS }} />
            {columns.map((column) => (
              <col key={column.time} style={{ width: COLUMN }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-neutral-1 p-0" />
              {days.map((day, index) => (
                <th
                  key={day.time}
                  colSpan={day.count}
                  className={cn(
                    "h-6 p-0 text-left text-xs font-medium",
                    index % 2 === 1 && "bg-neutral-2",
                  )}
                >
                  {/* The name of a day follows the grid while any of its hours is in view. */}
                  <span
                    className="sticky inline-block px-xxs whitespace-nowrap"
                    style={{ left: LABELS }}
                  >
                    {day.count > 1 ? formatDay(new Date(day.time)) : ""}
                  </span>
                </th>
              ))}
            </tr>
            <tr>
              <th className="sticky left-0 z-10 bg-neutral-1 p-0" />
              {columns.map((column) => (
                <th
                  key={column.time}
                  scope="col"
                  className={cn(
                    "h-6 p-0 text-center text-xs font-normal tabular-nums",
                    column.day % 2 === 1 && "bg-neutral-2",
                    column.night ? "text-neutral-6" : "text-neutral-9",
                  )}
                  aria-current={column.isNow ? "time" : undefined}
                >
                  <span
                    className={cn(
                      "inline-block rounded-full px-1",
                      column.isNow && "bg-neutral-10 font-medium text-neutral-1",
                    )}
                    title={formatClock(new Date(column.time))}
                  >
                    {String(new Date(column.time).getHours()).padStart(2, "0")}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {curves && curveRow("height")}
            {valueRow("height")}
            {valueRow("period")}
            {valueRow("energy")}
            {directionRow("waveDirection")}
            {spacer}
            {curves && curveRow("wind")}
            {valueRow("wind")}
            {valueRow("wind", strings.gust, "gust")}
            {directionRow("windDirection")}
            {tide && tide.points.length > 1 && (
              <>
                {spacer}
                <tr>
                  <RowLabel unit="m">{strings.tide}</RowLabel>
                  <td colSpan={columns.length} className="p-0">
                    <TideRow tide={tide} from={from} to={to} now={now} width={width} />
                  </td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const TIDE_HEIGHT = 56;

/** The tide under the grid: its curve on the hours of the columns, with its high and low waters. */
function TideRow({
  tide,
  from,
  to,
  now,
  width,
}: {
  tide: GridTide;
  from: number;
  to: number;
  now: number;
  width: number;
}) {
  const points = tide.points.filter((point) => point.time >= from && point.time <= to);
  if (points.length < 2) return null;
  const values = points.map((point) => point.value);
  const lowest = Math.min(...values);
  const highest = Math.max(...values);
  const x = (time: number) => ((time - from) / (to - from)) * width;
  const y = (value: number) =>
    TIDE_HEIGHT - 14 - ((value - lowest) / (highest - lowest || 1)) * (TIDE_HEIGHT - 28);
  const line = curvePath(points.map((point) => ({ x: x(point.time), y: y(point.value) })));

  return (
    <svg width={width} height={TIDE_HEIGHT} className="block" aria-hidden>
      <path
        d={`${line}L${x(points.at(-1)!.time)},${TIDE_HEIGHT}L${x(points[0]!.time)},${TIDE_HEIGHT}Z`}
        fill={TIDE_COLOR}
        fillOpacity={0.14}
      />
      <path d={line} fill="none" stroke={TIDE_COLOR} strokeWidth={1.5} />
      {now > from && now < to && (
        <line
          x1={x(now)}
          x2={x(now)}
          y1={0}
          y2={TIDE_HEIGHT}
          className="stroke-neutral-7"
          strokeDasharray="3 3"
        />
      )}
      {tide.extremes
        .filter((extreme) => extreme.time > from && extreme.time < to)
        .map((extreme) => (
          <text
            key={extreme.time}
            x={Math.min(width - 16, Math.max(16, x(extreme.time)))}
            y={extreme.high ? y(extreme.value) - 4 : y(extreme.value) + 12}
            textAnchor="middle"
            fontSize={10}
            className={cn("tabular-nums", extreme.high ? "fill-neutral-10" : "fill-neutral-7")}
          >
            <title>{formatMeters(extreme.value)}</title>
            {formatClock(new Date(extreme.time))}
          </text>
        ))}
    </svg>
  );
}
