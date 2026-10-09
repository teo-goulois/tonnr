import { EvilAreaChart } from "@repo/ui/components/evilcharts/charts/recharts-area-chart";
import { cn } from "@repo/ui/lib/utils";
import { type ReactNode, useMemo } from "react";

import { formatClock, formatDay, formatDayAndClock, formatNumber } from "@/lib/format";
import { type ScaleStop, scaleColor } from "@/lib/sea-scales";
import { m } from "@/paraglide/messages.js";

export type ChartPoint = { time: Date; value: number | null };

type SeaChartProps = {
  // Names the single series, so the chart needs no legend.
  label: string;
  points: ChartPoint[];
  // Colors the curve by its value, as the map does. Without it the curve takes the theme's ink.
  scale?: ScaleStop[];
  // The colors of the curve from its start to its end, when its value does not choose them.
  colors?: string[];
  // Writes a value with its unit, for the tooltip.
  formatValue: (value: number) => string;
  // A moment to mark with a vertical rule, such as now.
  marker?: Date;
  isLoading?: boolean;
  // Room above the plot, in pixels, for what `children` writes over the top of the curve.
  headroom?: number;
  // Room under the lowest value of the axis, in pixels, for what `children` writes below the curve.
  footroom?: number;
  // The figures of the heights, on the left. Without them the plot takes the whole width.
  yAxis?: boolean;
  // A figure of time every so many hours, whatever the span. Midnight has none: what scrolls
  // through days names the day itself.
  everyHours?: number;
  // The box that follows the pointer with the value under it.
  tooltip?: boolean;
  className?: string;
  // Parts drawn over the plot once the curve is there.
  children?: ReactNode;
};

const HOUR_MS = 60 * 60 * 1000;
// How many colors a curve is painted with from its first value to its last.
const COLOR_STEPS = 24;

// Midnights when the span covers days, every six hours otherwise.
function timeTicks(start: number, end: number, everyHours = end - start > 36 * HOUR_MS ? 24 : 6) {
  const ticks: number[] = [];

  const cursor = new Date(start);
  cursor.setMinutes(0, 0, 0);
  cursor.setHours(Math.ceil(cursor.getHours() / everyHours) * everyHours);
  for (; cursor.getTime() <= end; cursor.setHours(cursor.getHours() + everyHours)) {
    if (cursor.getTime() >= start) ticks.push(cursor.getTime());
  }
  return ticks;
}

// A round step that gives about four intervals between 0 and max.
function niceStep(max: number) {
  const rough = max / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].find((candidate) => candidate * magnitude >= rough) ?? 10;
  return step * magnitude;
}

// Round values from zero, or from below it when the curve goes there, to just above the curve.
export function valueTicks(lowest: number, highest: number) {
  const step = niceStep(Math.max(highest, -lowest, 0.1));
  const bottom = Math.min(0, Math.floor(lowest / step) * step);
  const top = Math.max(step, Math.ceil(highest / step) * step);
  const ticks: number[] = [];
  for (let value = bottom; value <= top + step / 2; value += step) ticks.push(value);
  return ticks;
}

// The color of the curve at regular moments between its first and its last value. The chart
// spreads them evenly along the curve, whatever the rhythm of the measurements.
function curveColors(rows: { time: number; value: number }[], scale: ScaleStop[]) {
  const first = rows[0]!;
  const last = rows.at(-1)!;
  const colors: string[] = [];
  let index = 0;
  for (let step = 0; step < COLOR_STEPS; step++) {
    const time = first.time + (step / (COLOR_STEPS - 1)) * (last.time - first.time);
    while (index < rows.length - 2 && rows[index + 1]!.time < time) index++;
    const before = rows[index]!;
    const after = rows[index + 1] ?? before;
    const ratio =
      after.time === before.time ? 0 : (time - before.time) / (after.time - before.time);
    const value = before.value + (after.value - before.value) * Math.min(1, Math.max(0, ratio));
    colors.push(scaleColor(scale, value));
  }
  return colors;
}

/** A value of the sea over time: one curve, the hours along the bottom, and a rule at a moment. */
export function SeaChart({
  label,
  points,
  scale,
  colors: givenColors,
  formatValue,
  marker,
  isLoading = false,
  headroom = 8,
  footroom = 0,
  yAxis = true,
  everyHours,
  tooltip = true,
  className,
  children,
}: SeaChartProps) {
  const data = useMemo(
    () => points.map((point) => ({ time: point.time.getTime(), value: point.value })),
    [points],
  );
  const measured = useMemo(
    () => data.filter((row): row is { time: number; value: number } => row.value !== null),
    [data],
  );
  const config = useMemo(() => {
    const colors =
      givenColors ??
      (scale && measured.length > 1 ? curveColors(measured, scale) : ["var(--color-1)"]);
    return { value: { label, colors: { light: colors, dark: colors } } };
  }, [label, measured, scale, givenColors]);

  const first = measured[0];
  const last = measured.at(-1);
  // The same box whether the chart is loading, empty or drawn, so nothing moves when data comes.
  const box = cn("aspect-auto h-44 w-full", className);

  if (!isLoading && (!first || !last || first.time === last.time)) {
    return (
      <p className={cn(box, "flex items-center text-s text-neutral-7")}>
        {m.chart_too_few_points()}
      </p>
    );
  }

  const start = first?.time ?? 0;
  const end = last?.time ?? 0;
  const values = measured.map((row) => row.value);
  const yTicks = valueTicks(Math.min(0, ...values), Math.max(0, ...values));
  const spansDays = end - start > 36 * HOUR_MS;
  const markerTime = marker?.getTime();

  return (
    <figure
      className="m-0"
      aria-label={
        first && last
          ? m.chart_label({
              label,
              start: formatDayAndClock(new Date(start)),
              end: formatDayAndClock(new Date(end)),
            })
          : label
      }
    >
      <EvilAreaChart
        className={box}
        config={config}
        data={data}
        curveType="monotone"
        isLoading={isLoading}
        loadingPoints={14}
        chartProps={{ margin: { top: headroom, right: yAxis ? 8 : 0, bottom: 0, left: 0 } }}
      >
        <EvilAreaChart.Grid />
        <EvilAreaChart.XAxis
          dataKey="time"
          type="number"
          scale="time"
          domain={[start, end]}
          ticks={timeTicks(start, end, everyHours).filter(
            (time) => !everyHours || new Date(time).getHours() !== 0,
          )}
          tickFormatter={(time: number) =>
            spansDays && !everyHours ? formatDay(new Date(time)) : formatClock(new Date(time))
          }
        />
        <EvilAreaChart.YAxis
          width={30}
          hide={!yAxis}
          padding={{ bottom: footroom }}
          ticks={yTicks}
          domain={[yTicks[0]!, yTicks.at(-1)!]}
          tickFormatter={(value: number) => formatNumber(value)}
        />
        {tooltip && (
          <EvilAreaChart.Tooltip
            hideIndicator
            valueFormatter={formatValue}
            labelFormatter={(_, payload) => {
              const time: unknown = payload?.[0]?.payload?.time;
              return typeof time === "number" ? formatDayAndClock(new Date(time)) : null;
            }}
          />
        )}
        {markerTime !== undefined && markerTime > start && markerTime < end && (
          <EvilAreaChart.ReferenceLine
            x={markerTime}
            stroke="var(--neutral-7)"
            strokeDasharray="3 3"
            label={{
              value: m.chart_now(),
              position: "insideTopRight",
              fill: "var(--neutral-7)",
              fontSize: 11,
            }}
          />
        )}
        <EvilAreaChart.Area dataKey="value" strokeVariant="solid" strokeWidth={2}>
          <EvilAreaChart.ActiveDot variant="border" />
        </EvilAreaChart.Area>
        {!isLoading && children}
      </EvilAreaChart>
    </figure>
  );
}
