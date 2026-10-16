import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { cn } from "@repo/ui/lib/utils";
import {
  type PointerEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { ChevronLeftIcon, ChevronRightIcon } from "@repo/ui/icon";

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
  // Whether the rows say their names in full, as Windguru's table does. Folded, they take no room
  // at all, for a reader who knows the rows by their order and their colors: a press on their
  // column folds them, and one on the edge of the grid, which says so when it is pointed at,
  // unfolds them.
  named?: boolean;
  onNamedChange?: (named: boolean) => void;
  // Told how to bring the grid back to now while it is scrolled away from it, and that there is
  // nothing to bring back once it is there.
  onAway?: (back: (() => void) | undefined) => void;
  // Shows a day more of the past, while the model holds one: a pull past the grid's start offers
  // it, and the pull held, or a press held on what it offers, takes it.
  onEarlier?: () => void;
};

const COLUMN = 34;
const LABELS = 68;
const ROW = "h-[26px]";
const MEASURED_REACH = 1.5 * HOUR_MS;
// How long a press holds still before it reads the hours under it instead of moving the grid.
const HOLD_MS = 350;
// How far a press may move and still be a press, in pixels.
const SLOP = 6;
// How far a pull goes past the grid's start before it offers the day before, in pixels, and how
// long it holds there, or a press holds on what it offers, before that day comes.
const OVERPULL = 48;
const EARLIER_MS = 1500;

// `day` counts the days from the first one.
type Column = { time: number; night: boolean; isNow: boolean; day: number };

function RowLabel({
  children,
  unit,
  quiet,
  className,
}: {
  children?: ReactNode;
  unit?: string;
  quiet?: boolean;
  className?: string;
}) {
  return (
    <th
      scope="row"
      data-names=""
      className={cn(
        "sticky left-0 z-10 bg-neutral-1 py-0 pr-xs pl-0 text-left text-xs font-normal whitespace-nowrap",
        "group-data-unnamed/grid:px-0",
        quiet && "text-neutral-7",
        className,
      )}
    >
      {/* Folded names are still said in full to a screen reader. */}
      <span className="group-data-unnamed/grid:sr-only">
        {children}
        {unit && <span className="ml-1 text-neutral-6">{unit}</span>}
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
  onEarlier,
}: ForecastGridProps) {
  const labels = named ? LABELS : 0;
  // Drawn again when the reader changes units: the wind's row is written in them.
  useUnits();
  const palette = usePalette();
  const all = metrics();
  const weather = weatherMetrics();
  const swell = swellMetric();
  // A point where no model gives a swell apart has no row for it.
  const hasSwell = model.some((sample) => sample.swell !== null);
  // A press on a day or an hour shows every hour, and another goes back to the grid's step. The
  // hour pressed stays where it was.
  const [hourly, setHourly] = useState(false);
  const shownStep = hourly ? 1 : stepHours;
  const step = shownStep * HOUR_MS;
  const scroller = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const hours = useRef<HTMLTableRowElement>(null);
  const [headHeight, setHeadHeight] = useState(0);
  // A press on the grid: a mouse that moves drags it, and a press that holds still reads the hour
  // under it, as long as it lasts.
  const press = useRef<{
    id: number;
    x: number;
    y: number;
    left: number;
    dragging: boolean;
    timer: number | undefined;
  } | null>(null);
  const dragged = useRef(false);
  const [reading, setReading] = useState<number>();
  const readingRef = useRef(false);
  // Where the pressed hour stood in the view, to keep it there once the step changes.
  const anchor = useRef<{ time: number; offset: number } | null>(null);
  // Whether the grid is away from now, said to `onAway` when it changes: kept out of the state,
  // since the grid has nothing to draw again for it.
  const away = useRef(false);
  // The day before, once a pull offered it, and the hold that takes it while it lasts. A hold
  // comes from the pull itself or from a press on what it offers.
  const [offered, setOffered] = useState(false);
  const [holding, setHolding] = useState<"pull" | "press">();
  const holdTimer = useRef<number | undefined>(undefined);
  const holdBy = useRef<"pull" | "press">(undefined);

  const columns = useMemo(() => {
    const first = new Date(start);
    first.setMinutes(0, 0, 0);
    first.setHours(Math.ceil(first.getHours() / shownStep) * shownStep);
    if (first.getTime() < start) first.setTime(first.getTime() + step);
    const list: Column[] = [];
    let previousDay = "";
    let day = -1;
    for (let time = first.getTime(); time <= end; time += step) {
      const date = new Date(time).toDateString();
      if (date !== previousDay) day++;
      list.push({
        time,
        night: place ? isNight(time, place.latitude, place.longitude) : false,
        isNow: Math.abs(time - now) <= step / 2,
        day,
      });
      previousDay = date;
    }
    return list;
  }, [start, end, now, step, shownStep, place]);

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

  // The grid opens with now at its left, after the columns of the past it is asked to keep. Once
  // the step changes, the hour that was pressed comes back where it stood.
  useLayoutEffect(() => {
    if (isLoading || !scroller.current) return;
    const kept = anchor.current;
    anchor.current = null;
    if (!kept) {
      scroller.current.scrollLeft = home;
      return;
    }
    const index = columns.findIndex((column) => column.time >= kept.time);
    scroller.current.scrollLeft = Math.max(0, index) * COLUMN - kept.offset;
    // Only a new span of time moves the grid: the minutes that pass do not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, columns.length, home]);

  // How tall the days and the hours stand, for the lines that go down from under them.
  useLayoutEffect(() => {
    const row = hours.current;
    if (row) setHeadHeight(row.offsetTop + row.offsetHeight);
  });

  function earlier() {
    window.clearTimeout(holdTimer.current);
    holdTimer.current = undefined;
    holdBy.current = undefined;
    setHolding(undefined);
    setOffered(false);
    if (!onEarlier || columns.length === 0) return;
    // What was the first hour stays where it stood: the day before comes in on its left.
    anchor.current = { time: columns[0]!.time, offset: 0 };
    // A drag that took it ends there: the grid under it has moved.
    press.current = null;
    onEarlier();
  }
  function startHold(by: "pull" | "press") {
    if (!onEarlier || holdTimer.current !== undefined) return;
    setOffered(true);
    setHolding(by);
    holdBy.current = by;
    holdTimer.current = window.setTimeout(earlier, EARLIER_MS);
  }
  function stopHold(by: "pull" | "press") {
    if (holdBy.current !== by) return;
    window.clearTimeout(holdTimer.current);
    holdTimer.current = undefined;
    holdBy.current = undefined;
    setHolding(undefined);
  }
  // A listener of the page reads these as they are when it is called.
  const pull = useRef({ startHold, stopHold, offer: () => setOffered(true) });
  pull.current = { startHold, stopHold, offer: () => setOffered(true) };
  const canPull = useRef(false);
  canPull.current = Boolean(onEarlier);

  // A finger that holds still reads the hours: the page no longer scrolls under it. Only a
  // listener that is not passive can say so, which React does not give. A finger that pulls the
  // grid past its start, which the grid does not follow, offers the day before.
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    let from: number | undefined;
    const begin = (event: TouchEvent) => {
      from = element.scrollLeft <= 0 ? event.touches[0]?.clientX : undefined;
    };
    const move = (event: TouchEvent) => {
      if (readingRef.current && event.cancelable) event.preventDefault();
      const x = event.touches[0]?.clientX;
      if (from === undefined || x === undefined || !canPull.current) return;
      if (element.scrollLeft > 0) from = undefined;
      else if (x - from > OVERPULL) pull.current.startHold("pull");
      else pull.current.stopHold("pull");
    };
    const end = () => {
      from = undefined;
      pull.current.stopHold("pull");
    };
    element.addEventListener("touchstart", begin, { passive: true });
    element.addEventListener("touchmove", move, { passive: false });
    element.addEventListener("touchend", end);
    element.addEventListener("touchcancel", end);
    return () => {
      element.removeEventListener("touchstart", begin);
      element.removeEventListener("touchmove", move);
      element.removeEventListener("touchend", end);
      element.removeEventListener("touchcancel", end);
    };
  }, [isLoading]);

  useEffect(() => () => window.clearTimeout(holdTimer.current), []);

  if (isLoading) return <Skeleton className="h-64 w-full rounded-(--radius-xs)" />;
  if (columns.length === 0) return null;

  // The moment under a point of the screen, between the columns around it.
  function timeAt(clientX: number) {
    const box = sheet.current?.getBoundingClientRect();
    if (!box || columns.length === 0) return undefined;
    const x = Math.min(Math.max(clientX - box.left - labels, 0), columns.length * COLUMN);
    return columns[0]!.time + (x / COLUMN - 0.5) * step;
  }
  function stopReading() {
    readingRef.current = false;
    setReading(undefined);
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !event.isPrimary) return;
    const target = event.currentTarget;
    const id = event.pointerId;
    const x = event.clientX;
    dragged.current = false;
    press.current = {
      id,
      x,
      y: event.clientY,
      left: target.scrollLeft,
      dragging: false,
      timer: window.setTimeout(() => {
        if (!press.current || press.current.dragging) return;
        readingRef.current = true;
        setReading(timeAt(x));
        target.setPointerCapture(id);
      }, HOLD_MS),
    };
  }
  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const current = press.current;
    if (!current || current.id !== event.pointerId) return;
    if (readingRef.current) {
      setReading(timeAt(event.clientX));
      return;
    }
    const moved = Math.hypot(event.clientX - current.x, event.clientY - current.y) > SLOP;
    if (!moved && !current.dragging) return;
    window.clearTimeout(current.timer);
    // A finger scrolls the grid itself. A mouse has no way to scroll sideways, so it drags it,
    // and the click that ends a drag is no click.
    if (event.pointerType !== "mouse") return;
    if (!current.dragging) {
      current.dragging = true;
      dragged.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    const wanted = current.left - (event.clientX - current.x);
    event.currentTarget.scrollLeft = wanted;
    // Pulled past the start and held there, the grid takes the day before.
    if (wanted < -OVERPULL) startHold("pull");
    else stopHold("pull");
  }
  function onPointerEnd() {
    stopHold("pull");
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = null;
    if (readingRef.current) {
      // The hold ends without a click on what it began on.
      dragged.current = true;
      stopReading();
    }
  }

  // Every hour, or the grid's step again, with the hour pressed kept where it stands.
  function toggleHours(time: number, element: Element) {
    if (dragged.current) return;
    const view = scroller.current?.getBoundingClientRect();
    const offset = view ? element.getBoundingClientRect().left - view.left - labels : 0;
    anchor.current = { time, offset };
    setHourly((every) => !every);
  }

  const width = columns.length * COLUMN;
  // Every other day has a shade under what has no color of its own, as its name has above.
  const shade = (column: Column) => column.day % 2 === 1 && "bg-neutral-2";
  // Where a moment stands on the sheet: a column is drawn around its hour.
  const xOf = (time: number) => labels + ((time - columns[0]!.time) / step + 0.5) * COLUMN;
  const nowX =
    now >= columns[0]!.time - step / 2 && now <= columns.at(-1)!.time + step / 2
      ? xOf(now)
      : undefined;
  // An hour read is said to five minutes.
  const readable = (time: number) => Math.round(time / (5 * 60 * 1000)) * 5 * 60 * 1000;
  const stepLabel = hourly ? m.details_every_step({ hours: stepHours }) : m.details_every_hour();
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
    const compares = buoy.some((sample) => sample[numeric] !== null);
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
                  shade(column),
                  (measuredValue !== undefined ||
                    (value !== undefined && colored.strong?.(value))) &&
                    "font-semibold",
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
            <RowLabel quiet className="h-5">
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
                  className={cn(
                    "h-5 p-0 text-center text-xs text-neutral-7 tabular-nums",
                    shade(column),
                  )}
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
              className={cn(height, "p-0 text-neutral-9", shade(column))}
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
      {/* The names' cell keeps the lines of the hours under the names, as their rows do. */}
      <th data-names="" className="sticky left-0 z-10 h-xs bg-neutral-1 p-0" />
      {columns.map((column) => (
        <td key={column.time} className={cn("h-xs p-0", shade(column))} />
      ))}
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
          if (event.currentTarget.scrollLeft > COLUMN * 2) setOffered(false);
          const next =
            nowIndex >= 0 && Math.abs(event.currentTarget.scrollLeft - home) > COLUMN * 2;
          if (next === away.current) return;
          away.current = next;
          onAway?.(
            next ? () => scroller.current?.scrollTo({ left: home, behavior: "smooth" }) : undefined,
          );
        }}
        // A trackpad that goes on past the start offers the day before: it has no way to hold.
        onWheel={(event) => {
          if (!onEarlier || event.currentTarget.scrollLeft > 0) return;
          if (event.deltaX < -2 && Math.abs(event.deltaX) > Math.abs(event.deltaY))
            setOffered(true);
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onContextMenu={(event) => readingRef.current && event.preventDefault()}
      >
        {/* The sheet the lines of now and of the hour read are drawn over. */}
        <div ref={sheet} className="relative w-max [-webkit-touch-callout:none]">
          <table
            data-unnamed={named ? undefined : ""}
            style={{ width: labels + width }}
            // The whole column of the names folds them and unfolds them, lit while it is pointed at.
            className={cn(
              "group/grid table-fixed border-separate border-spacing-0 select-none",
              onNamedChange &&
                "[&_[data-names]]:cursor-pointer [&:has([data-names]:hover)_[data-names]]:bg-neutral-2",
            )}
            onClick={(event) => {
              if (dragged.current || !onNamedChange) return;
              if (!(event.target as Element).closest("[data-names]")) return;
              onNamedChange(!named);
            }}
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
                  data-names=""
                  className="sticky left-0 z-10 bg-neutral-1 p-0 text-left align-middle"
                >
                  {/* The keyboard's way to the names: the pointer presses their column. Its click
                    reaches the table, which does the folding. */}
                  {onNamedChange && (
                    <button
                      type="button"
                      className="sr-only focus-visible:not-sr-only focus-visible:text-xs"
                      aria-expanded={named}
                    >
                      {m.details_row_names()}
                    </button>
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
                    {day.count > 1 && (
                      <button
                        type="button"
                        className={cn(bandName, "cursor-pointer px-xxs hover:underline")}
                        style={{ left: labels }}
                        title={stepLabel}
                        onClick={(event) =>
                          toggleHours(day.time, event.currentTarget.closest("th")!)
                        }
                      >
                        {formatDay(new Date(day.time))}
                      </button>
                    )}
                  </th>
                ))}
              </tr>
              <tr ref={hours}>
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
                    <button
                      type="button"
                      className={cn(
                        "inline-block cursor-pointer rounded-full px-1 hover:bg-neutral-3",
                        column.isNow &&
                          "bg-neutral-10 font-medium text-neutral-1 hover:bg-neutral-10",
                      )}
                      title={`${formatClock(new Date(column.time))} · ${stepLabel}`}
                      onClick={(event) =>
                        toggleHours(column.time, event.currentTarget.closest("th")!)
                      }
                    >
                      {String(new Date(column.time).getHours()).padStart(2, "0")}
                    </button>
                  </th>
                ))}
              </tr>
              {measuredColumns > 0 && (
                // Which hours are the buoy's and which the model's, said once above the figures.
                <tr>
                  <th data-names="" className="sticky left-0 z-10 bg-neutral-1 p-0" />
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
              {valueRows(all.energy)}
              {directionRow("waveDirection")}
              {/* The swell apart from the wind sea, under the whole sea it is a part of. */}
              {hasSwell && valueRows(swell)}
              {hasSwell && directionRow("swellDirection")}
              {spacer}
              {valueRows(all.wind)}
              {valueRows(all.wind, m.details_gusts(), "gust")}
              {directionRow("windDirection")}
              {spacer}
              {valueRows(weather.cloud)}
              {valueRows(weather.rain)}
              {valueRows(weather.air)}
            </tbody>
          </table>
          {nowX !== undefined && (
            <div
              aria-hidden
              className="pointer-events-none absolute bottom-0 z-[5] w-px bg-neutral-5"
              style={{ left: nowX, top: headHeight }}
            />
          )}
          {reading !== undefined && (
            <div
              aria-hidden
              className="pointer-events-none absolute top-0 bottom-0 z-20"
              style={{ left: xOf(reading) }}
            >
              <div className="absolute top-0 bottom-0 w-0.5 -translate-x-1/2 bg-neutral-10" />
              <span className="absolute top-0 -translate-x-1/2 rounded-full bg-neutral-10 px-xs py-px text-xs font-medium whitespace-nowrap text-neutral-1 tabular-nums">
                {formatDay(new Date(reading))} {formatClock(new Date(readable(reading)))}
              </span>
            </div>
          )}
        </div>
      </div>
      {offered && onEarlier && (
        <button
          type="button"
          className="absolute z-20 flex -translate-y-1/2 items-center gap-xxs overflow-hidden rounded-full bg-neutral-10 py-xxs pr-s pl-xs text-xs font-medium whitespace-nowrap text-neutral-1 select-none [-webkit-touch-callout:none]"
          style={{ left: labels + 8, top: `calc(${headHeight}px + (100% - ${headHeight}px) / 2)` }}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            startHold("press");
          }}
          onPointerUp={() => stopHold("press")}
          onPointerCancel={() => stopHold("press")}
          onContextMenu={(event) => event.preventDefault()}
          // A key has no hold: it takes the day at once.
          onClick={(event) => event.detail === 0 && earlier()}
        >
          {/* Fills while the hold lasts, and empties at once when it stops. */}
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 bg-neutral-1/25 ease-linear"
            style={{
              width: holding ? "100%" : "0%",
              transition: `width ${holding ? EARLIER_MS : 150}ms`,
            }}
          />
          <ChevronLeftIcon data-slot="icon" aria-hidden className="relative size-3" />
          <span className="relative">{m.details_earlier_hold()}</span>
        </button>
      )}
      {/* Folded, the names take no room: the edge of the grid says, once pointed at, that it
          unfolds them. */}
      {!named && onNamedChange && (
        <button
          type="button"
          className="group/edge absolute inset-y-0 left-0 z-20 w-3 cursor-pointer outline-none"
          aria-expanded={false}
          aria-label={m.details_row_names_show()}
          onClick={() => onNamedChange(true)}
        >
          <span className="absolute inset-y-0 left-0 w-0.5 bg-neutral-6 opacity-0 transition-opacity group-hover/edge:opacity-100 group-focus-visible/edge:opacity-100" />
          <span className="absolute top-1/2 left-1 flex -translate-y-1/2 items-center gap-xxs rounded-full bg-neutral-10 py-px pr-xs pl-xxs text-xs whitespace-nowrap text-neutral-1 opacity-0 transition-opacity group-hover/edge:opacity-100 group-focus-visible/edge:opacity-100">
            <ChevronRightIcon data-slot="icon" aria-hidden className="size-3" />
            {m.details_row_names_show()}
          </span>
        </button>
      )}
    </div>
  );
}
