// PROTOTYPE: thrown away once a variant of the details panel has won. See details-prototype.tsx.

import {
  useActiveTooltipLabel,
  useIsTooltipActive,
  usePlotArea,
  useXAxisScale,
  useYAxisScale,
  ZIndexLayer,
} from "@repo/ui/components/evilcharts/charts/recharts-area-chart";
import { useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { formatDayAndClock } from "@/lib/format";

import { SeaChart } from "../sea-chart";
import { Readout } from "./metric-lanes";
import {
  HOUR_MS,
  type Metric,
  type Sample,
  curvePath,
  formatMetric,
  metricColor,
  runsOf,
  t,
  valueAt,
} from "./metrics";

// Above the curve and the rule that follows the pointer.
const OVERLAY_LAYER = 1150;
// How many colors the model's curve is painted with from its start to its end.
const COLOR_STEPS = 64;
const MEASURED_REACH = 1.5 * HOUR_MS;

type MetricChartProps = {
  metric: Metric;
  measured: Sample[];
  model: Sample[];
  start: number;
  end: number;
  now: number;
  isLoading?: boolean;
};

/** What the buoy measured, drawn over the model's curve, and the values under the pointer. */
function BuoyLine({
  metric,
  measured,
  model,
  start,
  end,
  readout,
}: Omit<MetricChartProps, "isLoading" | "now"> & { readout: HTMLElement | null }) {
  const id = useId().replace(/:/g, "");
  const plot = usePlotArea();
  const xScale = useXAxisScale();
  const yScale = useYAxisScale();
  const isPointed = useIsTooltipActive();
  const pointedLabel = useActiveTooltipLabel();
  const runs = useMemo(
    () =>
      runsOf(
        measured.filter((sample) => sample.time >= start && sample.time <= end),
        metric.key,
      ),
    [measured, start, end, metric.key],
  );
  if (!plot || !xScale || !yScale) return null;

  const x = (time: number) => xScale(time) ?? plot.x;
  const y = (value: number) => yScale(value) ?? plot.y + plot.height;
  const pointed = isPointed ? Number(pointedLabel) : undefined;
  const buoy =
    pointed === undefined ? undefined : valueAt(measured, metric.key, pointed, MEASURED_REACH);
  const modelled = pointed === undefined ? undefined : valueAt(model, metric.key, pointed);

  return (
    <>
      <ZIndexLayer zIndex={OVERLAY_LAYER}>
        <g aria-hidden pointerEvents="none">
          <defs>
            {runs.map((run, index) => (
              <linearGradient
                key={index}
                id={`${id}-${index}`}
                gradientUnits="userSpaceOnUse"
                x1={plot.x}
                x2={plot.x + plot.width}
              >
                {run.map((point) => (
                  <stop
                    key={point.time}
                    offset={Math.min(1, Math.max(0, (x(point.time) - plot.x) / plot.width))}
                    stopColor={metricColor(metric, point.value)}
                  />
                ))}
              </linearGradient>
            ))}
          </defs>
          {runs.map((run, index) => {
            const line = curvePath(run.map((point) => ({ x: x(point.time), y: y(point.value) })));
            return (
              <g key={index} fill="none" strokeLinecap="round" strokeLinejoin="round">
                <path d={line} className="stroke-neutral-1" strokeWidth={6} />
                <path d={line} stroke={`url(#${id}-${index})`} strokeWidth={3} />
              </g>
            );
          })}
          {pointed !== undefined && (
            <g>
              <line
                x1={x(pointed)}
                x2={x(pointed)}
                y1={plot.y}
                y2={plot.y + plot.height}
                className="stroke-neutral-10"
                strokeOpacity={0.5}
              />
              {modelled !== undefined && (
                <circle
                  cx={x(pointed)}
                  cy={y(modelled)}
                  r={3.5}
                  strokeWidth={1.5}
                  className="fill-neutral-1"
                  stroke={metricColor(metric, modelled)}
                />
              )}
              {buoy !== undefined && (
                <circle
                  cx={x(pointed)}
                  cy={y(buoy)}
                  r={4.5}
                  strokeWidth={1.5}
                  className="stroke-neutral-1"
                  fill={metricColor(metric, buoy)}
                />
              )}
            </g>
          )}
        </g>
      </ZIndexLayer>
      {readout &&
        pointed !== undefined &&
        createPortal(
          <>
            <span className="text-xs text-neutral-7 tabular-nums">
              {formatDayAndClock(new Date(pointed))}
            </span>
            <Readout metric={metric} measured={measured} model={model} time={pointed} />
          </>,
          readout,
        )}
    </>
  );
}

/**
 * One value in full: the model's curve from two days ago to the days ahead, pale where the hours
 * are gone, and what the buoy measured drawn over it as a bold line.
 */
export function MetricChart({
  metric,
  measured,
  model,
  start,
  end,
  now,
  isLoading,
}: MetricChartProps) {
  const strings = t();
  const [readout, setReadout] = useState<HTMLDivElement | null>(null);
  const hasBuoy = measured.some((sample) => sample[metric.key] !== null);

  const points = useMemo(
    () =>
      model
        .filter((sample) => sample.time >= start && sample.time <= end)
        .map((sample) => ({ time: new Date(sample.time), value: sample[metric.key] })),
    [model, start, end, metric.key],
  );
  // The model's hours already gone are pale where a buoy says what the sea did.
  const colors = useMemo(() => {
    const first = points[0]?.time.getTime() ?? start;
    const last = points.at(-1)?.time.getTime() ?? end;
    return Array.from({ length: COLOR_STEPS }, (_, step) => {
      const time = first + (step / (COLOR_STEPS - 1)) * (last - first);
      const color = metricColor(metric, valueAt(model, metric.key, time) ?? 0);
      return hasBuoy && time < now ? color.replace(")", " / 0.5)") : color;
    });
  }, [points, model, metric, start, end, now, hasBuoy]);
  const include = useMemo(
    () =>
      measured.flatMap((sample) => {
        const value = sample[metric.key];
        return sample.time >= start && sample.time <= end && value !== null ? [value] : [];
      }),
    [measured, start, end, metric.key],
  );
  const latest = valueAt(model, metric.key, now);

  return (
    <div className="grid gap-xxs">
      <div className="flex h-(--line-s) items-center gap-xs">
        <div
          ref={setReadout}
          className="peer flex flex-1 items-center justify-between gap-xs empty:hidden"
        />
        {/* While nothing is pointed, the legend of the two curves stands where the values go. */}
        <div className="flex flex-1 items-center justify-end gap-s text-xs text-neutral-7 peer-[:not(:empty)]:hidden">
          {hasBuoy && (
            <span className="flex items-center gap-xxs">
              <span
                aria-hidden
                className="h-[3px] w-4 rounded-full"
                style={{ background: metricColor(metric, latest ?? 0) }}
              />
              {strings.buoy}
            </span>
          )}
          <span className="flex items-center gap-xxs">
            <span
              aria-hidden
              className="h-2.5 w-4 rounded-[2px] border-t-[1.5px]"
              style={{
                borderColor: metricColor(metric, latest ?? 0),
                background: `color-mix(in oklab, ${metricColor(metric, latest ?? 0)} 25%, transparent)`,
              }}
            />
            {strings.model}
            {latest !== undefined && ` ${formatMetric(metric, latest)}`}
          </span>
        </div>
      </div>
      <SeaChart
        label={metric.label}
        points={points}
        colors={colors}
        include={include}
        formatValue={(value) => formatMetric(metric, value)}
        marker={new Date(now)}
        tooltip={false}
        isLoading={isLoading}
        className="h-48"
      >
        <BuoyLine
          metric={metric}
          measured={measured}
          model={model}
          start={start}
          end={end}
          readout={readout}
        />
      </SeaChart>
    </div>
  );
}
