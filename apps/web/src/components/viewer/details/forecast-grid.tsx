import { Button } from "@repo/ui/components/ui/button";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { ChevronLeftIcon, ChevronRightIcon } from "@repo/ui/icon";
import { cn } from "@repo/ui/lib/utils";
import {
  type PointerEvent,
  type ReactNode,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { compassPoint, formatClock, formatDay } from "@/lib/format";
import { usePalette } from "@/lib/palette";
import { useUnits } from "@/lib/units";
import { m } from "@/paraglide/messages.js";

import { DirectionArrow } from "../map-markers";
import { LineGlyph } from "./line-glyph";
import {
  HOUR_MS,
  type Metric,
  type NumericKey,
  type Sample,
  cellColors,
  inPalette,
  directionAt,
  formatMetric,
  isNight,
  metrics,
  swellMetric,
  valueAt,
  weatherMetrics,
} from "./metrics";

type ForecastGridProps = {
  model: Sample[];
  // What the buoy measured. Where it has a reading, the grid shows it in place of the model's
  // figure, in bold, and writes the model's under it.
  measured?: Sample[];
  start: number;
  end: number;
  now: number;
  stepHours?: number;
  place?: { latitude: number; longitude: number };
  // How many columns of the past stay in view before the one of now, when the grid opens.
  lead?: number;
  isLoading?: boolean;
  // Whether the rows say their names in full. Folded, a row keeps the first letter of its name,
  // for a reader who knows the rows by their order and their colors, and the hours get the room.
  // An arrow over the names folds them and unfolds them.
  named?: boolean;
  onNamedChange?: (named: boolean) => void;
  // Told how to bring the grid back to now while it is scrolled away from it, and that there is
  // nothing to bring back once it is there.
  onAway?: (back: (() => void) | undefined) => void;
  // The rows beyond the waves, their period, the wind and the weather: the energy, the swell
  // apart, the gusts, and the model's figure under the buoy's. The density of the panel says
  // which are drawn. Decision 061.
  rows?: GridRow[];
};

export type GridRow = "energy" | "swell" | "gusts" | "model";
export const GRID_ROWS: GridRow[] = ["energy", "swell", "gusts", "model"];

const COLUMN = 34;
const LABELS = 68;
// The width of the names once they are folded to a letter.
const LETTERS = 24;
const ROW = "h-[26px]";
const MEASURED_REACH = 1.5 * HOUR_MS;
// A hair of the page's color before the first column of a day. A cell draws it: a column cannot.
const DAY_RULE = "shadow-[inset_1.5px_0_0_var(--neutral-1)]";

// `day` counts the days from the first one, and `newDay` marks the first column of the others.
type Column = { time: number; night: boolean; isNow: boolean; day: number; newDay: boolean };

function RowLabel({
  children,
  short,
  unit,
  quiet,
  className,
}: {
  children?: ReactNode;
  // What stands for the name once the names are folded. A name that is a word gives its letter.
  short?: ReactNode;
  unit?: string;
  quiet?: boolean;
  className?: string;
}) {
  const letter = short ?? (typeof children === "string" ? children.slice(0, 1).toUpperCase() : "");
  return (
    <th
      scope="row"
      className={cn(
        "sticky left-0 z-10 bg-neutral-1 py-0 pr-xs pl-0 text-left text-xs font-normal whitespace-nowrap",
        "group-data-unnamed/grid:pr-0 group-data-unnamed/grid:text-center",
        quiet && "text-neutral-7",
        className,
      )}
    >
      {/* Folded names are still said in full to a screen reader. */}
      <span className="group-data-unnamed/grid:sr-only">
        {children}
        {unit && <span className="ml-1 text-neutral-6">{unit}</span>}
      </span>
      <span
        aria-hidden
        title={typeof children === "string" ? children : undefined}
        className="hidden group-data-unnamed/grid:inline-flex"
      >
        {letter}
      </span>
    </th>
  );
}

/**
 * The days ahead as a grid to scroll sideways: a column every few hours, a row for each value,
 * each cell in the color of what it says. The names of the rows stay in view. With a buoy, the
 * hours it measured come first: its figures in bold, the model's written small under them.
 */
export function ForecastGrid({
  model,
  measured,
  start,
  end,
  now,
  stepHours = 3,
  place,
  lead = 0,
  isLoading = false,
  named = true,
  onNamedChange,
  onAway,
  rows = GRID_ROWS,
}: ForecastGridProps) {
  const labels = named ? LABELS : LETTERS;
  // Drawn again when the reader changes units: the wind's row is written in them.
  useUnits();
  const palette = usePalette();
  const all = metrics();
  const weather = weatherMetrics();
  const swell = swellMetric();
  // A point where no model gives a swell apart has no row for it.
  const hasSwell = rows.includes("swell") && model.some((sample) => sample.swell !== null);
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
  const buoy = measured ?? [];
  const read = (key: NumericKey, column: Column) =>
    column.time > now + step / 2 ? undefined : valueAt(buoy, key, column.time, MEASURED_REACH);
  // The columns the buoy has a wave height for: the hours the grid shows as measured.
  const measuredColumns = columns.filter((column) => read("height", column) !== undefined).length;
  const lastMeasured = columns.reduce(
    (last, column, index) => (read("height", column) === undefined ? last : index),
    -1,
  );

  function valueRows(
    metric: Metric,
    label: ReactNode = metric.label,
    numeric: NumericKey = metric.key,
  ) {
    const compares = rows.includes("model") && buoy.some((sample) => sample[numeric] !== null);
    const colored = inPalette(metric, palette);
    // An hour without rain leaves its cell empty, as a clear sky does.
    const shown = (value: number | undefined) =>
      value !== undefined && metric.hideZero && Number(value.toFixed(metric.digits)) === 0
        ? undefined
        : value;
    return (
      <>
        <tr>
          <RowLabel unit={numeric === "gust" ? undefined : metric.unit} className={ROW}>
            {label}
          </RowLabel>
          {columns.map((column) => {
            const measuredValue = read(numeric, column);
            const value = shown(measuredValue ?? valueAt(model, numeric, column.time, step / 2));
            return (
              <td
                key={column.time}
                className={cn(
                  ROW,
                  "p-0 text-center text-xs tabular-nums",
                  measuredValue !== undefined && "font-semibold",
                  column.newDay && DAY_RULE,
                )}
                style={
                  value === undefined || colored.plain ? undefined : cellColors(colored, value)
                }
              >
                {value === undefined ? "" : formatMetric(metric, value, false)}
              </td>
            );
          })}
        </tr>
        {compares && (
          <tr>
            <RowLabel quiet className="h-5" short={<LineGlyph dashed />}>
              <span className="flex items-center gap-xxs">
                <LineGlyph dashed />
                {m.details_model()}
              </span>
            </RowLabel>
            {columns.map((column) => {
              const modelled =
                read(numeric, column) === undefined
                  ? undefined
                  : valueAt(model, numeric, column.time, step / 2);
              return (
                <td
                  key={column.time}
                  className="h-5 p-0 text-center text-xs text-neutral-7 tabular-nums"
                >
                  {modelled === undefined ? "" : formatMetric(metric, modelled, false)}
                </td>
              );
            })}
          </tr>
        )}
      </>
    );
  }

  function directionRow(key: "waveDirection" | "swellDirection" | "windDirection") {
    // The sea's bearing is written in degrees under its arrow: a few degrees tell whether a swell
    // reaches into a bay. The wind's arrow is enough.
    const degrees = key !== "windDirection";
    const height = degrees ? "h-[38px]" : ROW;
    return (
      <tr>
        <RowLabel quiet className={height}>
          {m.details_direction()}
        </RowLabel>
        {columns.map((column) => {
          const bearing =
            (column.time <= now + step / 2
              ? directionAt(buoy, key, column.time, MEASURED_REACH)
              : undefined) ?? directionAt(model, key, column.time, step / 2);
          return (
            <td
              key={column.time}
              className={cn(height, "p-0 text-neutral-9", column.newDay && DAY_RULE)}
              title={bearing === undefined ? undefined : compassPoint(bearing)}
            >
              {bearing !== undefined && (
                <DirectionArrow fromDegrees={bearing} className="mx-auto size-3.5" />
              )}
              {bearing !== undefined && degrees && (
                <span className="block text-center text-xxs text-neutral-7 tabular-nums">
                  {Math.round(((bearing % 360) + 360) % 360) % 360}°
                </span>
              )}
            </td>
          );
        })}
      </tr>
    );
  }

  const spacer = (
    <tr aria-hidden>
      <td colSpan={columns.length + 1} className="h-xs p-0" />
    </tr>
  );
  // The name of a band follows the grid while any of its columns is in view.
  const bandName = "sticky inline-flex items-center gap-xxs pr-xs whitespace-nowrap";

  return (
    // A grid's track grows to what it holds: `min-w-0` keeps the table inside the panel.
    <div className="relative min-w-0">
      <div
        ref={scroller}
        className="cursor-grab overflow-x-auto overscroll-x-contain [scrollbar-width:none] active:cursor-grabbing"
        style={{ maskImage: "linear-gradient(to right, black calc(100% - 28px), transparent)" }}
        onScroll={(event) => {
          const next =
            nowIndex >= 0 && Math.abs(event.currentTarget.scrollLeft - home) > COLUMN * 2;
          if (next === away) return;
          setAway(next);
          onAway?.(
            next ? () => scroller.current?.scrollTo({ left: home, behavior: "smooth" }) : undefined,
          );
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        <table
          className="group/grid table-fixed border-separate border-spacing-0 select-none"
          data-unnamed={named ? undefined : ""}
          style={{ width: labels + width }}
        >
          <colgroup>
            <col style={{ width: labels }} />
            {columns.map((column) => (
              <col key={column.time} style={{ width: COLUMN }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {/* In the corner the names leave empty, over the days and the hours. */}
              <th
                rowSpan={2}
                className="sticky left-0 z-10 bg-neutral-1 p-0 text-left align-middle"
              >
                {onNamedChange && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="text-neutral-7"
                    aria-expanded={named}
                    aria-label={m.details_row_names()}
                    title={m.details_row_names()}
                    onClick={() => onNamedChange(!named)}
                  >
                    {named ? (
                      <ChevronLeftIcon data-slot="icon" aria-hidden />
                    ) : (
                      <ChevronRightIcon data-slot="icon" aria-hidden />
                    )}
                  </Button>
                )}
              </th>
              {days.map((day, index) => (
                <th
                  key={day.time}
                  colSpan={day.count}
                  className={cn(
                    "h-6 p-0 text-left text-xs font-medium",
                    index % 2 === 1 && "bg-neutral-2",
                  )}
                >
                  <span className={cn(bandName, "px-xxs")} style={{ left: labels }}>
                    {day.count > 1 ? formatDay(new Date(day.time)) : ""}
                  </span>
                </th>
              ))}
            </tr>
            <tr>
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
            {measuredColumns > 0 && (
              // Which hours are the buoy's and which the model's, said once above the figures.
              <tr>
                <th className="sticky left-0 z-10 bg-neutral-1 p-0" />
                <th
                  colSpan={lastMeasured + 1}
                  className="h-5 p-0 text-left text-xs font-medium shadow-[inset_0_calc(-1*var(--border-l))_0_var(--neutral-10)]"
                >
                  <span className={bandName} style={{ left: labels }}>
                    <LineGlyph />
                    {m.details_buoy()}
                  </span>
                </th>
                {lastMeasured + 1 < columns.length && (
                  <th
                    colSpan={columns.length - lastMeasured - 1}
                    className="h-5 border-b border-dashed border-neutral-6 p-0 pl-xs text-left text-xs font-normal text-neutral-7"
                  >
                    <span className={bandName} style={{ left: labels + 8 }}>
                      <LineGlyph dashed />
                      {m.details_model()}
                    </span>
                  </th>
                )}
              </tr>
            )}
          </thead>
          <tbody>
            {measuredColumns > 0 && spacer}
            {valueRows(all.height)}
            {valueRows(all.period)}
            {rows.includes("energy") && valueRows(all.energy)}
            {directionRow("waveDirection")}
            {/* The swell apart from the wind sea, under the whole sea it is a part of. */}
            {hasSwell && valueRows(swell)}
            {hasSwell && directionRow("swellDirection")}
            {spacer}
            {valueRows(all.wind)}
            {rows.includes("gusts") && valueRows(all.wind, m.details_gusts(), "gust")}
            {directionRow("windDirection")}
            {spacer}
            {valueRows(weather.cloud)}
            {valueRows(weather.rain)}
            {valueRows(weather.air)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
