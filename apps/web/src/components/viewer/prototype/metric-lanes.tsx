// PROTOTYPE: thrown away once a variant of the details panel has won. See details-prototype.tsx.

import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { cn } from "@repo/ui/lib/utils";
import { type PointerEvent, useEffect, useId, useMemo, useState } from "react";

import { formatClock, formatDay, formatDayAndClock, formatNumber } from "@/lib/format";

import { DirectionArrow } from "../map-markers";
import {
  HOUR_MS,
  type Metric,
  type MetricKey,
  METRIC_KEYS,
  type Sample,
  curvePath,
  directionAt,
  formatMetric,
  metricColor,
  metrics,
  niceTop,
  runsOf,
  t,
  valueAt,
} from "./metrics";

type Night = { from: number; to: number };

type MetricLanesProps = {
  keys?: MetricKey[];
  // What the buoy measured. Empty at a point without a buoy.
  measured: Sample[];
  model: Sample[];
  start: number;
  end: number;
  now: number;
  nights?: Night[];
  laneHeight?: number;
  isLoading?: boolean;
  className?: string;
};

// How long a buoy's last reading still speaks for the sea, when reading a value off the lanes.
const MEASURED_REACH = 1.5 * HOUR_MS;
const SNAP_MS = 30 * 60 * 1000;

export function useWidth(element: HTMLElement | null) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!element) return;
    const read = () => setWidth(element.clientWidth);
    read();
    const resized = new ResizeObserver(read);
    resized.observe(element);
    return () => resized.disconnect();
  }, [element]);
  return width;
}

type LaneCurveProps = {
  metric: Metric;
  measured: Sample[];
  model: Sample[];
  start: number;
  end: number;
  now: number;
  nights: Night[];
  width: number;
  height: number;
  pointed?: number;
  // Without the rules of the days and the figure of the axis, for a curve drawn small.
  bare?: boolean;
};

/** One value over time: the model as a soft area, the buoy as a bold line over it. */
export function LaneCurve({
  metric,
  measured,
  model,
  start,
  end,
  now,
  nights,
  width,
  height,
  pointed,
  bare = false,
}: LaneCurveProps) {
  const id = useId().replace(/:/g, "");
  const key = metric.key;

  const drawn = useMemo(() => {
    const inView = (sample: Sample) => sample.time >= start && sample.time <= end;
    const modelRuns = runsOf(model.filter(inView), key);
    const measuredRuns = runsOf(measured.filter(inView), key);
    const values = [...modelRuns, ...measuredRuns].flat().map((point) => point.value);
    const top = niceTop(Math.max(0, ...values) * 1.05);
    const bottom =
      metric.floor === undefined ? 0 : Math.min(metric.floor, Math.floor(Math.min(...values, 99)));
    return { modelRuns, measuredRuns, top, bottom };
  }, [measured, model, start, end, key, metric.floor]);

  if (width <= 0) return null;

  const x = (time: number) => ((time - start) / (end - start)) * width;
  const y = (value: number) =>
    height - 1 - ((value - drawn.bottom) / (drawn.top - drawn.bottom)) * (height - 8);
  const stops = (run: { time: number; value: number }[]) =>
    run.map((point) => (
      <stop
        key={point.time}
        offset={Math.min(1, Math.max(0, x(point.time) / width))}
        stopColor={metricColor(metric, point.value)}
      />
    ));
  const measuredValue =
    pointed === undefined ? undefined : valueAt(measured, key, pointed, MEASURED_REACH);
  const modelValue = pointed === undefined ? undefined : valueAt(model, key, pointed);

  const days: number[] = [];
  const midnight = new Date(start);
  midnight.setHours(24, 0, 0, 0);
  for (; midnight.getTime() < end; midnight.setDate(midnight.getDate() + 1)) {
    days.push(midnight.getTime());
  }

  return (
    <svg width={width} height={height} className="block overflow-visible" aria-hidden>
      <defs>
        {drawn.modelRuns.map((run, index) => (
          <linearGradient
            key={index}
            id={`${id}-model-${index}`}
            gradientUnits="userSpaceOnUse"
            x1={0}
            x2={width}
          >
            {stops(run)}
          </linearGradient>
        ))}
        {drawn.measuredRuns.map((run, index) => (
          <linearGradient
            key={index}
            id={`${id}-measured-${index}`}
            gradientUnits="userSpaceOnUse"
            x1={0}
            x2={width}
          >
            {stops(run)}
          </linearGradient>
        ))}
      </defs>
      {nights.map((night) => (
        <rect
          key={night.from}
          x={x(Math.max(start, night.from))}
          width={Math.max(0, x(Math.min(end, night.to)) - x(Math.max(start, night.from)))}
          y={0}
          height={height}
          className="fill-neutral-2"
        />
      ))}
      <line x1={0} x2={width} y1={height - 0.5} y2={height - 0.5} className="stroke-neutral-4" />
      {!bare &&
        days.map((day) => (
          <line
            key={day}
            x1={x(day)}
            x2={x(day)}
            y1={0}
            y2={height}
            className="stroke-neutral-4"
            strokeDasharray="2 3"
          />
        ))}
      {drawn.modelRuns.map((run, index) => {
        const points = run.map((point) => ({ x: x(point.time), y: y(point.value) }));
        const line = curvePath(points);
        return (
          <g key={index}>
            <path
              d={`${line}L${points.at(-1)!.x},${height}L${points[0]!.x},${height}Z`}
              fill={`url(#${id}-model-${index})`}
              fillOpacity={0.2}
            />
            <path d={line} fill="none" stroke={`url(#${id}-model-${index})`} strokeWidth={1.25} />
          </g>
        );
      })}
      {drawn.measuredRuns.map((run, index) => {
        const line = curvePath(run.map((point) => ({ x: x(point.time), y: y(point.value) })));
        return (
          <g key={index} fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d={line} className="stroke-neutral-1" strokeWidth={5} />
            <path d={line} stroke={`url(#${id}-measured-${index})`} strokeWidth={2.5} />
          </g>
        );
      })}
      {!bare && (
        <text x={2} y={10} fontSize={10} className="fill-neutral-6 tabular-nums">
          {formatNumber(drawn.top, 0)}
        </text>
      )}
      {now > start && now < end && (
        <line
          x1={x(now)}
          x2={x(now)}
          y1={0}
          y2={height}
          className="stroke-neutral-7"
          strokeDasharray="3 3"
        />
      )}
      {pointed !== undefined && (
        <g>
          <line
            x1={x(pointed)}
            x2={x(pointed)}
            y1={0}
            y2={height}
            className="stroke-neutral-10"
            strokeOpacity={0.5}
          />
          {modelValue !== undefined && (
            <circle
              cx={x(pointed)}
              cy={y(modelValue)}
              r={3}
              strokeWidth={1.5}
              className="fill-neutral-1"
              stroke={metricColor(metric, modelValue)}
            />
          )}
          {measuredValue !== undefined && (
            <circle
              cx={x(pointed)}
              cy={y(measuredValue)}
              r={4}
              strokeWidth={1.5}
              className="stroke-neutral-1"
              fill={metricColor(metric, measuredValue)}
            />
          )}
        </g>
      )}
    </svg>
  );
}

/** What a metric reads at a moment: the buoy when it has a reading there, the model beside it. */
export function Readout({
  metric,
  measured,
  model,
  time,
  className,
}: {
  metric: Metric;
  measured: Sample[];
  model: Sample[];
  time: number;
  className?: string;
}) {
  const strings = t();
  const measuredValue = valueAt(measured, metric.key, time, MEASURED_REACH);
  const modelValue = valueAt(model, metric.key, time);
  const shown = measuredValue ?? modelValue;
  const bearing =
    metric.direction &&
    (measuredValue === undefined
      ? directionAt(model, metric.direction, time)
      : (directionAt(measured, metric.direction, time, MEASURED_REACH) ??
        directionAt(model, metric.direction, time)));

  return (
    <span className={cn("flex items-center gap-xxs tabular-nums", className)}>
      {shown !== undefined && (
        <span
          aria-hidden
          className="size-2 shrink-0 rounded-full"
          style={{ background: metricColor(metric, shown) }}
        />
      )}
      <span className="text-s font-medium">
        {shown === undefined ? "–" : formatMetric(metric, shown)}
      </span>
      {bearing !== undefined && <DirectionArrow fromDegrees={bearing} className="size-3" />}
      {modelValue !== undefined && (
        <span className="text-xs text-neutral-7">
          {measuredValue === undefined
            ? strings.model
            : `${strings.model} ${formatMetric(metric, modelValue)}`}
        </span>
      )}
    </span>
  );
}

function Lane({ pointed, ...curve }: LaneCurveProps) {
  return (
    <div className="grid gap-0.5">
      <div className="flex items-baseline justify-between gap-xs text-xs">
        <span className="text-neutral-7">{curve.metric.label}</span>
        <Readout
          metric={curve.metric}
          measured={curve.measured}
          model={curve.model}
          time={pointed ?? curve.now}
        />
      </div>
      <LaneCurve {...curve} pointed={pointed} />
    </div>
  );
}

/**
 * The swell, its period, its energy and the wind as four lanes on one span of time, read
 * together: the pointer runs through all four, and each says its value under it.
 */
export function MetricLanes({
  keys = METRIC_KEYS,
  measured,
  model,
  start,
  end,
  now,
  nights = [],
  laneHeight = 52,
  isLoading = false,
  className,
}: MetricLanesProps) {
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const width = useWidth(box);
  const [pointed, setPointed] = useState<number>();
  const all = metrics();
  const strings = t();

  function point(event: PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
    setPointed(Math.round((start + ratio * (end - start)) / SNAP_MS) * SNAP_MS);
  }

  if (isLoading) {
    return (
      <div className={cn("grid gap-xs", className)}>
        {keys.map((key) => (
          <Skeleton
            key={key}
            className="w-full rounded-(--radius-xs)"
            style={{ height: laneHeight + 22 }}
          />
        ))}
      </div>
    );
  }

  const x = (time: number) => ((time - start) / (end - start)) * width;
  const spansDays = end - start > 30 * HOUR_MS;
  const labels: number[] = [];
  const cursor = new Date(start);
  if (spansDays) {
    // A day is named in its middle, when the whole of it is in view.
    cursor.setHours(12, 0, 0, 0);
    for (; cursor.getTime() < end; cursor.setDate(cursor.getDate() + 1)) {
      if (cursor.getTime() - start > 6 * HOUR_MS && end - cursor.getTime() > 6 * HOUR_MS) {
        labels.push(cursor.getTime());
      }
    }
  } else {
    cursor.setMinutes(0, 0, 0);
    cursor.setHours(Math.ceil(cursor.getHours() / 6) * 6);
    for (; cursor.getTime() < end; cursor.setHours(cursor.getHours() + 6)) {
      if (cursor.getTime() > start + HOUR_MS) labels.push(cursor.getTime());
    }
  }
  const head = pointed ?? now;

  return (
    <div className={cn("grid gap-xxs", className)}>
      <div className="relative h-(--line-xs) text-xs tabular-nums">
        {width > 0 && head > start && head < end && (
          <span
            className={cn(
              "absolute top-0 -translate-x-1/2 whitespace-nowrap",
              pointed === undefined ? "text-neutral-7" : "font-medium",
            )}
            style={{ left: Math.min(width - 34, Math.max(34, x(head))) }}
          >
            {pointed === undefined ? strings.now : formatDayAndClock(new Date(pointed))}
          </span>
        )}
      </div>
      <div
        ref={setBox}
        className="grid cursor-crosshair touch-pan-y gap-xs"
        onPointerDown={point}
        onPointerMove={point}
        onPointerLeave={() => setPointed(undefined)}
        onPointerCancel={() => setPointed(undefined)}
      >
        {keys.map((key) => (
          <Lane
            key={key}
            metric={all[key]}
            measured={measured}
            model={model}
            start={start}
            end={end}
            now={now}
            nights={nights}
            width={width}
            height={laneHeight}
            pointed={pointed}
          />
        ))}
      </div>
      <div className="relative h-(--line-xs) text-xs text-neutral-7 tabular-nums">
        {width > 0 &&
          labels.map((label) => (
            <span
              key={label}
              className="absolute top-0 -translate-x-1/2 whitespace-nowrap"
              style={{ left: x(label) }}
            >
              {spansDays ? formatDay(new Date(label)) : formatClock(new Date(label))}
            </span>
          ))}
      </div>
    </div>
  );
}
