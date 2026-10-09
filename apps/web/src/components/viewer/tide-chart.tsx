import {
  useActiveTooltipLabel,
  useIsTooltipActive,
  usePlotArea,
  useXAxisScale,
  useYAxisScale,
  ZIndexLayer,
} from "@repo/ui/components/evilcharts/charts/recharts-area-chart";
import { Button } from "@repo/ui/components/ui/button";
import { cn } from "@repo/ui/lib/utils";
import {
  type PointerEvent,
  type ReactNode,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { formatClock, formatDay, formatMeters, formatNumber } from "@/lib/format";
import { TIDE_COLOR, TIDE_PAST_COLOR } from "@/lib/sea-scales";
import { m } from "@/paraglide/messages.js";

import { type ChartPoint, SeaChart, valueTicks } from "./sea-chart";
import type { TideExtremes } from "./types";

type Row = { time: number; value: number };
type Crossing = Row & { rising: boolean };

type TideChartProps = {
  label: string;
  points: ChartPoint[];
  // The high and low waters to name on the curve.
  extremes: TideExtremes["extremes"];
  now?: Date;
  isLoading?: boolean;
  className?: string;
};

// Above the rule that follows the pointer, below the dot the chart puts under it.
const MARKS_LAYER = 1150;
// The room a time takes beside its dot, in pixels.
const LABEL_WIDTH = 40;
// How many colors a day of the curve is painted with, to turn pale where the hours are gone.
const COLOR_STEPS_PER_DAY = 96;
const DAY_MS = 24 * 60 * 60 * 1000;
// How long a strip let go by the mouse takes to settle on a day, in milliseconds.
const SETTLE_MS = 400;

// The moments the water stands at a height, each placed between the two predictions around it.
function crossingsAt(rows: Row[], level: number) {
  const crossings: Crossing[] = [];
  for (let index = 1; index < rows.length; index++) {
    const before = rows[index - 1]!;
    const after = rows[index]!;
    const rising = before.value < level && level <= after.value;
    const falling = before.value > level && level >= after.value;
    if (!rising && !falling) continue;
    const ratio = (level - before.value) / (after.value - before.value);
    crossings.push({
      time: before.time + ratio * (after.time - before.time),
      value: level,
      rising,
    });
  }
  return crossings;
}

// The height of the water at a moment between two predictions.
function heightAt(rows: Row[], time: number) {
  const next = rows.findIndex((row) => row.time >= time);
  if (next <= 0) return undefined;
  const before = rows[next - 1]!;
  const after = rows[next]!;
  return (
    before.value +
    ((time - before.time) / (after.time - before.time)) * (after.value - before.value)
  );
}

// Text over the curve, rimmed with the page's color so that a line under it does not cut it.
function Mark({
  x,
  y,
  anchor = "middle",
  strong = false,
  children,
}: {
  x: number;
  y: number;
  anchor?: "start" | "middle" | "end";
  strong?: boolean;
  children: ReactNode;
}) {
  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      fontSize={11}
      strokeWidth={3}
      strokeLinejoin="round"
      className={cn(
        "stroke-neutral-1 tabular-nums [paint-order:stroke]",
        strong ? "fill-neutral-10 font-medium" : "fill-neutral-7",
      )}
    >
      {children}
    </text>
  );
}

/**
 * What a tide curve says beyond its line: the high and low waters, the moment it is now, and,
 * under the pointer, a level line with every other moment the water stands at that height.
 */
function TideMarks({
  rows,
  extremes,
  now,
  axis,
}: Pick<TideChartProps, "extremes"> & {
  rows: Row[];
  now?: number;
  // Where the figures of the heights are written: beside the strip, so they stay when it scrolls.
  axis: HTMLElement | null;
}) {
  const plot = usePlotArea();
  const xScale = useXAxisScale();
  const yScale = useYAxisScale();
  // The figures the chart would write on its own axis, which the strip hides.
  const ticks = useMemo(() => {
    const values = rows.map((row) => row.value);
    return valueTicks(Math.min(0, ...values), Math.max(0, ...values));
  }, [rows]);
  const isPointed = useIsTooltipActive();
  const pointedTime = useActiveTooltipLabel();

  const first = rows[0];
  const last = rows.at(-1);
  if (!plot || !xScale || !yScale || !first || !last) return null;

  const left = plot.x;
  const right = plot.x + plot.width;
  const bottom = plot.y + plot.height;
  const x = (time: number) => xScale(time) ?? left;
  const y = (value: number) => yScale(value) ?? bottom;

  const pointedIndex = isPointed ? rows.findIndex((row) => row.time === Number(pointedTime)) : -1;
  const pointed = rows[pointedIndex];
  const nowHeight = now === undefined ? undefined : heightAt(rows, now);

  // A time sits where the curve leaves room: before its dot, above the line when the water
  // rises and below when it falls. Against the left edge it goes to the other side, mirrored.
  function levelMark(crossing: Crossing, strong: boolean) {
    const cx = x(crossing.time);
    const cy = y(crossing.value);
    const before = cx - LABEL_WIDTH >= left;
    const above = (crossing.rising === before || cy + 16 > bottom) && cy - 16 > 0;
    return (
      <Mark
        key={crossing.time}
        x={before ? cx - 6 : cx + 6}
        y={above ? cy - 6 : cy + 14}
        anchor={before ? "end" : "start"}
        strong={strong}
      >
        {formatClock(new Date(crossing.time))}
      </Mark>
    );
  }

  let level: ReactNode = null;
  if (pointed) {
    const next = rows[pointedIndex + 1];
    const previous = rows[pointedIndex - 1];
    const rising = next ? next.value > pointed.value : previous!.value < pointed.value;
    const step = (next ?? pointed).time - (previous ?? pointed).time;
    const others = crossingsAt(rows, pointed.value).filter(
      (crossing) => Math.abs(crossing.time - pointed.time) > step,
    );
    const cy = y(pointed.value);
    level = (
      <g>
        <line x1={left} x2={right} y1={cy} y2={cy} className="stroke-color-1" strokeWidth={1} />
        {others.map((crossing) => (
          <circle
            key={crossing.time}
            cx={x(crossing.time)}
            cy={cy}
            r={3}
            strokeWidth={1.5}
            className="fill-neutral-1 stroke-color-1"
          />
        ))}
        {others.map((crossing) => levelMark(crossing, false))}
        {levelMark({ ...pointed, rising }, true)}
      </g>
    );
  }

  const figures =
    axis &&
    createPortal(
      <>
        {ticks.map((tick) => (
          <span
            key={tick}
            className="absolute inset-x-0 -translate-y-1/2 pr-xs text-right text-xs text-muted-foreground tabular-nums"
            style={{ top: y(tick) }}
          >
            {formatNumber(tick)}
          </span>
        ))}
        {/* The height under the pointer, over the figure the axis has there. */}
        {pointed && (
          <span
            className="absolute inset-x-0 mr-xxs -translate-y-1/2 rounded-(--radius-xs) bg-color-1 text-center text-xs font-medium text-neutral-1 tabular-nums"
            style={{ top: y(pointed.value) }}
          >
            {formatNumber(pointed.value)}
          </span>
        )}
      </>,
      axis,
    );

  return (
    <>
      <ZIndexLayer zIndex={MARKS_LAYER}>
        <g aria-hidden pointerEvents="none">
          {now !== undefined && nowHeight !== undefined && (
            <g>
              <line
                x1={x(now)}
                x2={x(now)}
                y1={plot.y}
                y2={bottom}
                strokeDasharray="3 3"
                className="stroke-neutral-7"
              />
              <circle cx={x(now)} cy={y(nowHeight)} r={4} fill={TIDE_COLOR} />
            </g>
          )}
          {!pointed &&
            extremes
              .filter((extreme) => {
                const time = extreme.time.getTime();
                return time > first.time && time < last.time;
              })
              .map((extreme) => {
                const cx = x(extreme.time.getTime());
                const cy = y(extreme.heightMeters);
                // A high water is named above the curve and a low water below it, clear of its line.
                const ty = extreme.type === "high" ? cy - 20 : cy + 15;
                // Kept whole inside the plot when the high or low water is near an edge.
                const tx = Math.min(right - LABEL_WIDTH / 2, Math.max(left + LABEL_WIDTH / 2, cx));
                return (
                  <g key={extreme.time.getTime()}>
                    <line
                      x1={cx}
                      x2={cx}
                      y1={cy}
                      y2={bottom}
                      stroke={TIDE_COLOR}
                      strokeOpacity={0.4}
                    />
                    <Mark x={tx} y={ty} strong>
                      {formatClock(extreme.time)}
                    </Mark>
                    <Mark x={tx} y={ty + 12}>
                      {formatMeters(extreme.heightMeters)}
                    </Mark>
                  </g>
                );
              })}
          {level}
        </g>
      </ZIndexLayer>
      {figures}
    </>
  );
}

/**
 * The tide as a strip of days to scroll along, one day wide, with its high and low waters and the
 * moments it stands at one height. The strip opens on today.
 */
export function TideChart({ label, points, extremes, now, isLoading, className }: TideChartProps) {
  const rows = useMemo(
    () =>
      points.flatMap((point) =>
        point.value === null ? [] : [{ time: point.time.getTime(), value: point.value }],
      ),
    [points],
  );
  const start = rows[0]?.time ?? 0;
  const end = rows.at(-1)?.time ?? 0;
  const days = Math.max(1, Math.round((end - start) / DAY_MS));
  const moment = now?.getTime();
  const today =
    moment !== undefined && moment > start && moment < end
      ? Math.floor((moment - start) / DAY_MS)
      : undefined;

  const [axis, setAxis] = useState<HTMLDivElement | null>(null);
  const strip = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; left: number } | null>(null);
  // The day the strip is scrolled to. Until it has moved, that is today.
  const [scrolledTo, setScrolledTo] = useState<number>();
  const shown = Math.min(days - 1, scrolledTo ?? today ?? 0);
  const shownDay = new Date(start);
  shownDay.setDate(shownDay.getDate() + shown);

  function scrollToDay(day: number, behavior: ScrollBehavior) {
    const element = strip.current;
    element?.scrollTo({ left: day * element.clientWidth, behavior });
  }

  useLayoutEffect(() => {
    scrollToDay(today ?? 0, "instant");
  }, [today, days]);

  // A mouse has no way to scroll sideways, so it drags the strip, which then settles on a day.
  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    const element = event.currentTarget;
    drag.current = { x: event.clientX, left: element.scrollLeft };
    element.setPointerCapture(event.pointerId);
    element.style.scrollSnapType = "none";
  }
  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    event.currentTarget.scrollLeft = drag.current.left - (event.clientX - drag.current.x);
  }
  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    const element = event.currentTarget;
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    drag.current = null;
    scrollToDay(
      Math.round(element.scrollLeft / element.clientWidth),
      smooth ? "smooth" : "instant",
    );
    setTimeout(() => (element.style.scrollSnapType = ""), smooth ? SETTLE_MS : 0);
  }

  // Today's hours already gone are pale, and so are the days before.
  const colors = useMemo(() => {
    if (moment === undefined || moment <= start || moment >= end) return [TIDE_COLOR];
    const steps = days * COLOR_STEPS_PER_DAY;
    return Array.from({ length: steps }, (_, step) =>
      start + (step / (steps - 1)) * (end - start) < moment ? TIDE_PAST_COLOR : TIDE_COLOR,
    );
  }, [start, end, days, moment]);

  return (
    <div className="grid gap-xxs">
      <div className="flex h-8 items-center justify-between gap-xs">
        <span className="text-s tabular-nums" aria-live="polite">
          {shown === today ? m.tide_today() : formatDay(shownDay)}
        </span>
        {today !== undefined && shown !== today && (
          <Button variant="secondary" size="xs" onClick={() => scrollToDay(today, "smooth")}>
            {m.tide_today()}
          </Button>
        )}
      </div>
      <div className="flex">
        <div ref={setAxis} aria-hidden className="relative w-[30px] shrink-0" />
        <div
          ref={strip}
          role="group"
          aria-label={label}
          tabIndex={0}
          className="min-w-0 flex-1 cursor-grab snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] active:cursor-grabbing"
          onScroll={(event) => {
            const element = event.currentTarget;
            setScrolledTo(Math.round(element.scrollLeft / element.clientWidth));
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="relative" style={{ width: `${days * 100}%` }}>
            {/* One stop a day for the strip to settle on. */}
            <div aria-hidden className="pointer-events-none absolute inset-0 flex">
              {Array.from({ length: days }, (_, day) => (
                <div key={day} className="flex-1 snap-start" />
              ))}
            </div>
            <SeaChart
              label={label}
              colors={colors}
              formatValue={formatMeters}
              points={points}
              isLoading={isLoading}
              headroom={36}
              footroom={32}
              yAxis={false}
              everyHours={6}
              tooltip={false}
              className={cn("h-56", className)}
            >
              <TideMarks rows={rows} extremes={extremes} now={moment} axis={axis} />
            </SeaChart>
          </div>
        </div>
      </div>
    </div>
  );
}
