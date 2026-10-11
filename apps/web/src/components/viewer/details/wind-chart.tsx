import {
  EvilAreaChart,
  useActiveTooltipLabel,
  useIsTooltipActive,
  usePlotArea,
  useXAxisScale,
  useYAxisScale,
  ZIndexLayer,
} from "@repo/ui/components/evilcharts/charts/recharts-area-chart";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { cn } from "@repo/ui/lib/utils";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  compassPoint,
  formatClock,
  formatDay,
  formatDayAndClock,
  formatNumber,
} from "@/lib/format";
import { WIND_SPEED_SCALE, scaleColor } from "@/lib/sea-scales";
import { m } from "@/paraglide/messages.js";

import { useChartTurn } from "../chart-turns";
import { DirectionArrow } from "../map-markers";
import { curveColors, valueTicks } from "../sea-chart";
import { useChartTouch } from "../use-chart-touch";
import { LineGlyph } from "./line-glyph";
import { HOUR_MS } from "./metrics";
import { type WindRow, bearingsAlong, rowNear } from "./wind";

type Night = { from: number; to: number };

type WindChartProps = {
  // The wind over the span, oldest first, as `windRows` gives it.
  rows: WindRow[];
  start: number;
  end: number;
  nights?: Night[];
  isLoading?: boolean;
  className?: string;
};

// Under the grid, where a band of gray tells the night from the day.
const NIGHTS_LAYER = -150;
// Above the curves and the grid.
const MARKS_LAYER = 1150;
const X_AXIS_HEIGHT = 30;
const Y_AXIS_WIDTH = 30;
// How many bearings are written under the plot, from its start to its end.
const BEARINGS = 12;
const BOX = "aspect-auto h-[190px] w-full";

// Every other hour of a short span, and the noons of a span of days: a day is named under its
// noon. Hours written one after the other would not all fit a phone.
function timeTicksOf(start: number, end: number) {
  const days = end - start > 12 * HOUR_MS;
  const every = days ? 24 : 2;
  const ticks: number[] = [];
  const cursor = new Date(start);
  if (days) cursor.setHours(12, 0, 0, 0);
  else cursor.setHours(Math.ceil((cursor.getHours() + 1) / every) * every, 0, 0, 0);
  for (; cursor.getTime() < end; cursor.setHours(cursor.getHours() + every)) {
    if (cursor.getTime() > start) ticks.push(cursor.getTime());
  }
  return { ticks, format: days ? formatDay : formatClock };
}

function colorsOf(rows: WindRow[], key: "wind" | "gust") {
  const points = rows.flatMap((row) => {
    const value = row[key];
    return value === null ? [] : [{ time: row.time, value }];
  });
  return points.length > 1 ? curveColors(points, WIND_SPEED_SCALE) : ["var(--neutral-7)"];
}

/**
 * What the chart draws beyond its curves: the nights, the days, and the moment under the
 * pointer. It also tells the chart which moment that is, so the figures above can read it.
 */
function WindMarks({
  start,
  end,
  nights,
  pointed,
  onPoint,
  touchTime,
  isTouch,
}: {
  start: number;
  end: number;
  nights: Night[];
  pointed: WindRow | undefined;
  onPoint: (time: number | undefined) => void;
  touchTime: number | undefined;
  isTouch: boolean;
}) {
  const plot = usePlotArea();
  const xScale = useXAxisScale();
  const yScale = useYAxisScale();
  const isPointed = useIsTooltipActive();
  const pointedLabel = useActiveTooltipLabel();
  // The chart speaks while the pointer is on it, and says so once when the pointer leaves.
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

  // A span of days is ruled at each midnight. Six hours are not: their hours are written.
  const days: number[] = [];
  if (end - start > 12 * HOUR_MS) {
    const midnight = new Date(start);
    midnight.setHours(24, 0, 0, 0);
    for (; midnight.getTime() < end; midnight.setDate(midnight.getDate() + 1)) {
      days.push(midnight.getTime());
    }
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
          {pointed?.wind != null && (
            <g>
              <line
                x1={x(pointed.time)}
                x2={x(pointed.time)}
                y1={top}
                y2={bottom}
                className="stroke-neutral-10"
                strokeOpacity={0.5}
              />
              {pointed.gust !== null && (
                <circle
                  cx={x(pointed.time)}
                  cy={y(pointed.gust)}
                  r={3.5}
                  strokeWidth={1.5}
                  className="fill-neutral-1"
                  stroke={scaleColor(WIND_SPEED_SCALE, pointed.gust)}
                />
              )}
              <circle
                cx={x(pointed.time)}
                cy={y(pointed.wind)}
                r={4.5}
                strokeWidth={1.5}
                className="stroke-neutral-1"
                fill={scaleColor(WIND_SPEED_SCALE, pointed.wind)}
              />
            </g>
          )}
        </g>
      </ZIndexLayer>
    </>
  );
}

/** The two lines named and, under the pointer, the moment they are read at and what they read. */
function WindLegend({
  read,
  hasGusts,
  isLoading,
}: {
  // The row under the pointer. Undefined at rest.
  read: WindRow | undefined;
  hasGusts: boolean;
  isLoading: boolean;
}) {
  return (
    <>
      <div className="flex h-(--line-xs) items-center justify-between gap-xs text-xs text-neutral-7">
        <span className="flex items-center gap-s">
          <span className="flex items-center gap-xxs">
            <LineGlyph />
            {m.details_wind()}
          </span>
          {hasGusts && (
            <span className="flex items-center gap-xxs">
              <LineGlyph thin />
              {m.details_gusts()}
            </span>
          )}
        </span>
        {read && !isLoading && (
          <span className="font-medium text-neutral-10 tabular-nums">
            {formatDayAndClock(new Date(read.time))}
          </span>
        )}
      </div>
      <div className="flex h-(--line-s) items-center justify-between gap-xs">
        <span className="text-xs text-neutral-6">{m.unit_kn()}</span>
        {read?.wind != null && !isLoading && (
          <span className="flex items-center gap-xs text-s font-medium tabular-nums">
            <span className="flex items-center gap-xxs">
              <LineGlyph color={scaleColor(WIND_SPEED_SCALE, read.wind)} />
              {formatNumber(read.wind, 0)}
            </span>
            {read.gust !== null && (
              <span className="flex items-center gap-xxs">
                <LineGlyph thin color={scaleColor(WIND_SPEED_SCALE, read.gust)} />
                {formatNumber(read.gust, 0)}
              </span>
            )}
            {read.direction !== null && (
              <span className="flex items-center gap-xxs">
                <DirectionArrow fromDegrees={read.direction} className="size-3" />
                {compassPoint(read.direction)}
              </span>
            )}
          </span>
        )}
      </div>
    </>
  );
}

/**
 * The wind a station measured over a span: its speed as a bold line, its gusts as a thin one
 * above, and where it came from along the bottom. The figures over the plot read the moment
 * under the pointer.
 */
export function WindChart({
  rows,
  start,
  end,
  nights = [],
  isLoading = false,
  className,
}: WindChartProps) {
  const isMyTurn = useChartTurn();
  const [pointedTime, setPointedTime] = useState<number>();
  // The rows that hold a wind speed: the others only stop the curve where the station was silent.
  const drawn = useMemo(() => rows.filter((row) => row.wind !== null), [rows]);
  const touch = useChartTouch({
    start,
    end,
    left: Y_AXIS_WIDTH,
    right: 1,
    enabled: isMyTurn && !isLoading,
    samples: drawn,
  });
  const config = useMemo(() => {
    const wind = colorsOf(rows, "wind");
    const gust = colorsOf(rows, "gust");
    return {
      wind: { label: m.details_wind(), colors: { light: wind, dark: wind } },
      gust: { label: m.details_gusts(), colors: { light: gust, dark: gust } },
    };
  }, [rows]);
  const ticks = useMemo(
    () => valueTicks(0, Math.max(1, ...drawn.map((row) => Math.max(row.wind!, row.gust ?? 0)))),
    [drawn],
  );
  const hasGusts = drawn.some((row) => row.gust !== null);
  const bearings = useMemo(() => bearingsAlong(rows, start, end, BEARINGS), [rows, start, end]);

  // Keep axes and curves mounted while only the reading moves.
  const curves = useMemo(() => {
    const time = timeTicksOf(start, end);
    return (
      <>
        <EvilAreaChart.Grid />
        <EvilAreaChart.XAxis
          dataKey="time"
          type="number"
          scale="time"
          domain={[start, end]}
          height={X_AXIS_HEIGHT}
          ticks={time.ticks}
          tickFormatter={(tick: number) => time.format(new Date(tick))}
        />
        <EvilAreaChart.YAxis
          width={Y_AXIS_WIDTH}
          tickMargin={4}
          ticks={ticks}
          domain={[ticks[0]!, ticks.at(-1)!]}
          tickFormatter={(value: number) => formatNumber(value, 0)}
        />
        {hasGusts && (
          <EvilAreaChart.Area
            dataKey="gust"
            strokeVariant="solid"
            strokeWidth={1.25}
            areaProps={{ dataKey: "gust", fill: "none" }}
          />
        )}
        <EvilAreaChart.Area
          dataKey="wind"
          variant="gradient"
          strokeVariant="solid"
          strokeWidth={2.5}
        />
      </>
    );
  }, [start, end, ticks, hasGusts]);

  // The figures over the plot are those under the pointer. At rest they are left unwritten: the
  // tiles above the chart hold the last reading, and a step of the chart is a mean of several.
  const pointed = pointedTime === undefined ? undefined : rowNear(drawn, pointedTime);
  const isEmpty = !isLoading && drawn.length < 2;

  return (
    <div className={cn("grid min-w-0 gap-xs", className)}>
      {!isEmpty && (
        <p className="text-xs text-neutral-7 [@media(pointer:fine)]:hidden">
          {m.chart_touch_hint()}
        </p>
      )}
      <div className="grid gap-0.5">
        {!isEmpty && <WindLegend read={pointed} hasGusts={hasGusts} isLoading={isLoading} />}
        {isEmpty ? (
          <p className={cn(BOX, "flex items-center text-s text-neutral-7")}>
            {m.chart_too_few_points()}
          </p>
        ) : (
          <figure
            ref={touch.ref}
            onKeyDownCapture={touch.onKeyDownCapture}
            className="m-0 select-none [-webkit-touch-callout:none]"
            aria-label={m.details_wind()}
          >
            {/* A chart waits for its turn, and a box of its size holds its place. */}
            {!isMyTurn ? (
              <Skeleton className={cn(BOX, "rounded-(--radius-xs)")} />
            ) : (
              <EvilAreaChart
                className={BOX}
                config={config}
                data={rows}
                curveType="monotone"
                isLoading={isLoading}
                loadingPoints={14}
                chartProps={{ margin: { top: 6, right: 1, bottom: 0, left: 0 } }}
              >
                {curves}
                {!isLoading && (
                  <WindMarks
                    start={start}
                    end={end}
                    nights={nights}
                    pointed={pointed}
                    onPoint={setPointedTime}
                    touchTime={touch.time}
                    isTouch={touch.isTouch}
                  />
                )}
              </EvilAreaChart>
            )}
          </figure>
        )}
      </div>
      {/* Where the wind came from, a bearing for each twelfth of the span, under its moments. */}
      {!isEmpty && !isLoading && (
        <div
          aria-hidden
          className="grid h-4 grid-cols-12 items-center justify-items-center text-neutral-8"
          style={{ marginLeft: Y_AXIS_WIDTH, marginRight: 1 }}
        >
          {bearings.map((bearing, index) =>
            bearing === null ? (
              // oxlint-disable-next-line react/no-array-index-key -- the parts of a span keep their place
              <span key={index} />
            ) : (
              // oxlint-disable-next-line react/no-array-index-key -- the parts of a span keep their place
              <DirectionArrow key={index} fromDegrees={bearing} className="size-3" />
            ),
          )}
        </div>
      )}
    </div>
  );
}
