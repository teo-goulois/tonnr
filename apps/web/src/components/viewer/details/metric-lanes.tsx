import {
  EvilAreaChart,
  useActiveTooltipLabel,
  useIsTooltipActive,
  usePlotArea,
  useXAxisScale,
  useYAxisScale,
  ZIndexLayer,
} from "@repo/ui/components/evilcharts/charts/recharts-area-chart";
import { Badge } from "@repo/ui/components/ui/badge";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { cn } from "@repo/ui/lib/utils";
import { useEffect, useMemo, useRef, useState } from "react";

import { formatDay, formatDayAndClock, formatNumber } from "@/lib/format";
import { m } from "@/paraglide/messages.js";

import { useChartTurn } from "../chart-turns";
import { DirectionArrow } from "../map-markers";
import { curveColors, valueTicks } from "../sea-chart";
import { nearestChartPoint, useChartTouch } from "../use-chart-touch";
import { LineGlyph } from "./line-glyph";
import {
  DAY_MS,
  HOUR_MS,
  type Metric,
  type MetricKey,
  METRIC_KEYS,
  type Sample,
  directionAt,
  formatDelta,
  formatMetric,
  metricColor,
  metrics,
  valueAt,
} from "./metrics";

type Night = { from: number; to: number };

// One moment of a lane: what the model says, what the buoy measured, and the room between them.
type LaneRow = {
  time: number;
  model: number | null;
  buoy: number | null;
  gap: [number, number] | null;
};

type MetricLanesProps = {
  keys?: MetricKey[];
  // What the buoy measured. Empty at a point without a buoy.
  measured: Sample[];
  model: Sample[];
  start: number;
  end: number;
  now: number;
  nights?: Night[];
  isLoading?: boolean;
  className?: string;
};

// Under the grid, where a band of gray tells the night from the day.
const NIGHTS_LAYER = -150;
// Above the curves and the grid.
const MARKS_LAYER = 1150;
// A reading older than this no longer stands for the sea now.
const LIVE_REACH = 3 * HOUR_MS;
// The height of the figures of time under the last lane, in pixels: its box is that much taller
// than the `h-24` of the others, so the four plots are one height.
const X_AXIS_HEIGHT = 30;
const Y_AXIS_WIDTH = 30;

function rowsOf(
  key: Metric["key"],
  measured: Sample[],
  model: Sample[],
  start: number,
  end: number,
) {
  // A point every half hour, or every hour once the span is a week.
  const step = end - start > 5 * DAY_MS ? HOUR_MS : HOUR_MS / 2;
  const lastReading = measured.filter((sample) => sample[key] !== null).at(-1)?.time ?? 0;
  const rows: LaneRow[] = [];
  for (let time = Math.ceil(start / step) * step; time <= end; time += step) {
    const modelled = valueAt(model, key, time, HOUR_MS) ?? null;
    // A buoy says nothing of the hours after its last reading.
    const read = time <= lastReading ? (valueAt(measured, key, time, HOUR_MS) ?? null) : null;
    rows.push({
      time,
      model: modelled,
      buoy: read,
      gap:
        modelled !== null && read !== null
          ? [Math.min(modelled, read), Math.max(modelled, read)]
          : null,
    });
  }
  return rows;
}

// Round figures from zero to just above the curves. A period starts near its lowest value: a
// swell of 8 s on an axis from zero would be a flat line.
function ticksOf(metric: Metric, values: number[]) {
  if (values.length === 0) return [0, 1];
  if (metric.floor === undefined) return valueTicks(0, Math.max(...values));
  const low = Math.max(0, Math.floor(Math.min(...values)) - 1);
  const high = Math.ceil(Math.max(...values)) + 1;
  const step = Math.max(1, Math.ceil((high - low) / 3));
  const ticks: number[] = [];
  for (let value = low; value < high + step; value += step) ticks.push(value);
  return ticks;
}

function colorsOf(metric: Metric, rows: LaneRow[], key: "model" | "buoy") {
  const points = rows.flatMap((row) => {
    const value = row[key];
    return value === null ? [] : [{ time: row.time, value }];
  });
  return points.length > 1 ? curveColors(points, metric.scale) : ["var(--neutral-7)"];
}

/**
 * What a lane draws beyond its curves: the nights, the days, the moment it is now, and the
 * moment under the pointer. It also tells the lanes which moment that is, so all four mark it.
 */
function LaneMarks({
  metric,
  start,
  end,
  now,
  nights,
  pointed,
  onPoint,
  touchTime,
  isTouch,
}: {
  metric: Metric;
  start: number;
  end: number;
  now: number;
  nights: Night[];
  pointed: LaneRow | undefined;
  onPoint: (time: number | undefined) => void;
  touchTime: number | undefined;
  isTouch: boolean;
}) {
  const plot = usePlotArea();
  const xScale = useXAxisScale();
  const yScale = useYAxisScale();
  const isPointed = useIsTooltipActive();
  const pointedLabel = useActiveTooltipLabel();
  // Only the lane the pointer is on speaks, and it says so once when the pointer leaves it.
  const spoke = useRef(false);
  useEffect(() => {
    if (isTouch ? touchTime !== undefined : isPointed) {
      spoke.current = true;
      onPoint(isTouch ? touchTime : Number(pointedLabel));
    } else if (spoke.current) {
      spoke.current = false;
      onPoint(undefined);
    }
  }, [isPointed, pointedLabel, onPoint, isTouch, touchTime]);

  if (!plot || !xScale || !yScale) return null;

  const top = plot.y;
  const bottom = plot.y + plot.height;
  const x = (time: number) => xScale(time) ?? plot.x;
  const y = (value: number) => yScale(value) ?? bottom;

  const days: number[] = [];
  const midnight = new Date(start);
  midnight.setHours(24, 0, 0, 0);
  for (; midnight.getTime() < end; midnight.setDate(midnight.getDate() + 1)) {
    days.push(midnight.getTime());
  }

  return (
    <>
      <ZIndexLayer zIndex={NIGHTS_LAYER}>
        <g aria-hidden pointerEvents="none">
          {nights.map((night) => {
            const from = x(Math.max(start, night.from));
            const to = x(Math.min(end, night.to));
            return (
              <rect
                key={night.from}
                x={from}
                width={Math.max(0, to - from)}
                y={top}
                height={plot.height}
                className="fill-neutral-2"
              />
            );
          })}
        </g>
      </ZIndexLayer>
      <ZIndexLayer zIndex={MARKS_LAYER}>
        <g aria-hidden pointerEvents="none">
          {days.map((day) => (
            <line
              key={day}
              x1={x(day)}
              x2={x(day)}
              y1={top}
              y2={bottom}
              className="stroke-neutral-4"
            />
          ))}
          {now > start && now < end && (
            <line
              x1={x(now)}
              x2={x(now)}
              y1={top}
              y2={bottom}
              strokeDasharray="3 3"
              className="stroke-neutral-10"
            />
          )}
          {pointed && (
            <g>
              <line
                x1={x(pointed.time)}
                x2={x(pointed.time)}
                y1={top}
                y2={bottom}
                className="stroke-neutral-10"
                strokeOpacity={0.5}
              />
              {pointed.model !== null && (
                <circle
                  cx={x(pointed.time)}
                  cy={y(pointed.model)}
                  r={3.5}
                  strokeWidth={1.5}
                  className="fill-neutral-1"
                  stroke={metricColor(metric, pointed.model)}
                />
              )}
              {pointed.buoy !== null && (
                <circle
                  cx={x(pointed.time)}
                  cy={y(pointed.buoy)}
                  r={4.5}
                  strokeWidth={1.5}
                  className="stroke-neutral-1"
                  fill={metricColor(metric, pointed.buoy)}
                />
              )}
            </g>
          )}
        </g>
      </ZIndexLayer>
    </>
  );
}

type LaneProps = Required<
  Pick<MetricLanesProps, "measured" | "model" | "start" | "end" | "now">
> & {
  metric: Metric;
  nights: Night[];
  isLoading: boolean;
  // The moment under the pointer, on whichever lane it is.
  pointedTime: number | undefined;
  onPoint: (time: number | undefined) => void;
  // The last lane writes the days under its plot, for all four.
  last: boolean;
};

/** One value over time: the model as a dashed line, the buoy as a bold one, and what parts them. */
function Lane({
  metric,
  measured,
  model,
  start,
  end,
  now,
  nights,
  isLoading,
  pointedTime,
  onPoint,
  last,
}: LaneProps) {
  const isMyTurn = useChartTurn();
  const rows = useMemo(
    () => rowsOf(metric.key, measured, model, start, end),
    [metric.key, measured, model, start, end],
  );
  const touch = useChartTouch({
    start,
    end,
    left: Y_AXIS_WIDTH,
    right: 1,
    enabled: isMyTurn && !isLoading,
    samples: rows,
  });
  const hasBuoy = rows.some((row) => row.buoy !== null);
  const config = useMemo(() => {
    const modelColors = colorsOf(metric, rows, "model");
    const buoyColors = colorsOf(metric, rows, "buoy");
    const gapColors = ["var(--neutral-8)"];
    return {
      model: { label: m.details_model(), colors: { light: modelColors, dark: modelColors } },
      buoy: { label: m.details_buoy(), colors: { light: buoyColors, dark: buoyColors } },
      gap: { label: m.details_gap(), colors: { light: gapColors, dark: gapColors } },
    };
  }, [metric, rows]);
  const ticks = useMemo(
    () =>
      ticksOf(
        metric,
        rows.flatMap((row) => [row.model, row.buoy].filter((value) => value !== null)),
      ),
    [metric, rows],
  );
  // A day is named under its noon, and ruled at its midnight.
  const noons = useMemo(() => {
    const list: number[] = [];
    const noon = new Date(start);
    noon.setHours(12, 0, 0, 0);
    for (; noon.getTime() < end; noon.setDate(noon.getDate() + 1)) {
      if (noon.getTime() > start) list.push(noon.getTime());
    }
    return list;
  }, [start, end]);

  const pointed =
    pointedTime === undefined ? undefined : rows.find((row) => row.time === pointedTime);
  // At rest a lane reads the buoy's last reading while it is recent, and the model now otherwise.
  const lastRead = rows.filter((row) => row.buoy !== null).at(-1);
  const rest =
    lastRead && now - lastRead.time <= LIVE_REACH
      ? lastRead
      : rows.reduce<LaneRow | undefined>(
          (nearest, row) =>
            row.model !== null &&
            (!nearest || Math.abs(row.time - now) < Math.abs(nearest.time - now))
              ? row
              : nearest,
          undefined,
        );
  const read = pointed ?? rest;
  const bearing =
    metric.direction &&
    read &&
    ((read.buoy !== null
      ? directionAt(measured, metric.direction, read.time, HOUR_MS)
      : undefined) ??
      directionAt(model, metric.direction, read.time, HOUR_MS));

  return (
    <div className="grid min-w-0 gap-0.5">
      <div className="flex h-(--line-s) items-center justify-between gap-xs">
        <span className="text-xs text-neutral-7">
          {metric.label}
          <span className="ml-1 text-neutral-6">{metric.unit}</span>
        </span>
        {read && !isLoading && (
          <span className="flex items-center gap-xs tabular-nums">
            {read.buoy !== null && (
              <span className="flex items-center gap-xxs text-s font-medium">
                <LineGlyph color={metricColor(metric, read.buoy)} />
                {formatMetric(metric, read.buoy, false)}
              </span>
            )}
            {read.model !== null && (
              <span
                className={cn(
                  "flex items-center gap-xxs",
                  read.buoy === null ? "text-s font-medium" : "text-xs text-neutral-7",
                )}
              >
                <LineGlyph dashed color={metricColor(metric, read.model)} />
                {formatMetric(metric, read.model, false)}
              </span>
            )}
            {bearing !== undefined && <DirectionArrow fromDegrees={bearing} className="size-3" />}
            {read.buoy !== null && read.model !== null && (
              <Badge className="min-w-9 tabular-nums">
                {/* The difference of the two figures as they are written, so the three agree. */}
                {formatDelta(
                  metric,
                  Number(read.model.toFixed(metric.digits)) -
                    Number(read.buoy.toFixed(metric.digits)),
                  false,
                )}
              </Badge>
            )}
          </span>
        )}
      </div>
      <figure
        ref={touch.ref}
        onKeyDownCapture={touch.onKeyDownCapture}
        className="m-0 select-none [-webkit-touch-callout:none]"
        aria-label={metric.label}
      >
        {/* A lane is a chart: it waits for its turn, and a box of its size holds its place. */}
        {!isMyTurn ? (
          <Skeleton className={cn("w-full rounded-(--radius-xs)", last ? "h-[126px]" : "h-24")} />
        ) : (
          <EvilAreaChart
            className={cn("aspect-auto w-full", last ? "h-[126px]" : "h-24")}
            config={config}
            data={rows}
            curveType="monotone"
            isLoading={isLoading}
            loadingPoints={14}
            chartProps={{ margin: { top: 6, right: 1, bottom: 0, left: 0 } }}
          >
            <EvilAreaChart.Grid />
            <EvilAreaChart.XAxis
              dataKey="time"
              type="number"
              scale="time"
              domain={[start, end]}
              hide={!last}
              height={X_AXIS_HEIGHT}
              ticks={noons}
              tickFormatter={(time: number) => formatDay(new Date(time))}
            />
            <EvilAreaChart.YAxis
              width={Y_AXIS_WIDTH}
              tickMargin={4}
              ticks={ticks}
              domain={[ticks[0]!, ticks.at(-1)!]}
              tickFormatter={(value: number) => formatNumber(value)}
            />
            {hasBuoy && (
              <EvilAreaChart.Area
                dataKey="gap"
                variant="lines"
                strokeVariant="solid"
                animationType="none"
                areaProps={{ dataKey: "gap", stroke: "none", fillOpacity: 1 }}
              />
            )}
            <EvilAreaChart.Area
              dataKey="model"
              variant="gradient"
              strokeVariant="dashed"
              strokeWidth={1.5}
            />
            {hasBuoy && (
              <EvilAreaChart.Area
                dataKey="buoy"
                strokeVariant="solid"
                strokeWidth={2.5}
                areaProps={{ dataKey: "buoy", fill: "none" }}
              />
            )}
            {!isLoading && (
              <LaneMarks
                metric={metric}
                start={start}
                end={end}
                now={now}
                nights={nights}
                pointed={pointed}
                onPoint={onPoint}
                touchTime={nearestChartPoint(rows, touch.time)?.time}
                isTouch={touch.isTouch}
              />
            )}
          </EvilAreaChart>
        )}
      </figure>
    </div>
  );
}

/**
 * The swell, its period, its energy and the wind as four lanes on one span of time, read
 * together: the pointer runs through all four, and each says its value under it. Where a buoy
 * measured, its line is drawn over the model's and the room between them is hatched.
 */
export function MetricLanes({
  keys = METRIC_KEYS,
  measured,
  model,
  start,
  end,
  now,
  nights = [],
  isLoading = false,
  className,
}: MetricLanesProps) {
  const [pointed, setPointed] = useState<number>();
  const all = metrics();
  const hasBuoy = measured.length > 0;

  return (
    <div className={cn("grid gap-s", className)}>
      <p className="text-xs text-neutral-7 [@media(pointer:fine)]:hidden">{m.chart_touch_hint()}</p>
      <div className="flex h-(--line-xs) items-center justify-between gap-xs text-xs text-neutral-7">
        <span className="flex items-center gap-s">
          {hasBuoy && (
            <>
              <span className="flex items-center gap-xxs">
                <LineGlyph />
                {m.details_buoy()}
              </span>
              <span className="flex items-center gap-xxs">
                <LineGlyph dashed />
                {m.details_model()}
              </span>
            </>
          )}
        </span>
        <span
          className={cn("tabular-nums", pointed !== undefined && "font-medium text-neutral-10")}
        >
          {pointed === undefined ? m.details_now() : formatDayAndClock(new Date(pointed))}
        </span>
      </div>
      {keys.map((key, index) => (
        <Lane
          key={key}
          metric={all[key]}
          measured={measured}
          model={model}
          start={start}
          end={end}
          now={now}
          nights={nights}
          isLoading={isLoading}
          pointedTime={pointed}
          onPoint={setPointed}
          last={index === keys.length - 1}
        />
      ))}
    </div>
  );
}
