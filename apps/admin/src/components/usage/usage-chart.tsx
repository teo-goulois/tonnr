import { EvilAreaChart } from "@repo/ui/components/evilcharts/charts/recharts-area-chart";
import { useMemo } from "react";

import {
  formatClock,
  formatCount,
  formatDay,
  formatDayAndHour,
  formatShortDay,
} from "@/lib/format";
import { type Range, type UsagePoint, fillSeries } from "@/lib/usage";
import { m } from "@/paraglide/messages.js";

type UsageChartProps = {
  // What the API counted. An hour or a day it left out had no call.
  points: UsagePoint[];
  range: Range;
  isLoading?: boolean;
};

const HOUR_MS = 60 * 60 * 1000;
// What the chart's own fills leave out: a count is a block of its color, not a tint under a line.
const FILLED = { fillOpacity: 1, stroke: "var(--neutral-1)", strokeWidth: 1, strokeOpacity: 1 };
const DAY_MS = 24 * HOUR_MS;

// About six moments named along the bottom, each at a round time of the reader's clock.
function timeTicks(range: Range) {
  const span = range.to.getTime() - range.from.getTime();
  const ticks: number[] = [];
  const cursor = new Date(range.from);

  if (range.step === "hour" && span <= 2 * DAY_MS) {
    cursor.setHours(Math.ceil(cursor.getHours() / 4) * 4, 0, 0, 0);
    for (; cursor < range.to; cursor.setHours(cursor.getHours() + 4)) ticks.push(cursor.getTime());
    return ticks;
  }
  const everyDays = Math.max(1, Math.round(span / DAY_MS / 6));
  cursor.setHours(0, 0, 0, 0);
  if (cursor < range.from) cursor.setDate(cursor.getDate() + 1);
  for (; cursor < range.to; cursor.setDate(cursor.getDate() + everyDays)) {
    ticks.push(cursor.getTime());
  }
  return ticks;
}

// A round step that gives about four intervals up to the highest count.
function countTicks(highest: number) {
  const rough = Math.max(highest, 4) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step =
    ([1, 2, 5, 10].find((candidate) => candidate * magnitude >= rough) ?? 10) * magnitude;
  const ticks: number[] = [];
  for (let value = 0; value < highest + step; value += step) ticks.push(value);
  return ticks;
}

/**
 * The calls over time, one step for each hour or day: those that were answered, and above them
 * those that were not. The theme has one ink and its signals, so the chart tells two things
 * apart and leaves the five outcomes to the figures above it and to the tables.
 */
export function UsageChart({ points, range, isLoading = false }: UsageChartProps) {
  const data = useMemo(
    () =>
      fillSeries(points, range).map((point) => ({
        time: point.at.getTime(),
        answered: point.answered,
        unanswered: point.invalid + point.refused + point.limited + point.failed,
      })),
    [points, range],
  );
  const config = useMemo(
    () => ({
      answered: {
        label: m.outcome_answered(),
        colors: { light: ["var(--color-1)"], dark: ["var(--color-1)"] },
      },
      unanswered: {
        label: m.usage_not_answered(),
        colors: { light: ["var(--error)"], dark: ["var(--error)"] },
      },
    }),
    [],
  );

  const start = range.from.getTime();
  // The last step is drawn up to the end of its hour or day.
  const end = range.to.getTime();
  const drawn = data.length > 0 ? [...data, { ...data.at(-1)!, time: end }] : data;
  const yTicks = countTicks(Math.max(0, ...data.map((row) => row.answered + row.unanswered)));
  const byDay = range.step === "day";
  const spansDays = end - start > 2 * DAY_MS;

  return (
    <figure
      className="m-0"
      aria-label={m.usage_chart_label({
        start: formatDayAndHour(range.from),
        end: formatDayAndHour(range.to),
      })}
    >
      <EvilAreaChart
        className="aspect-auto h-56 w-full"
        config={config}
        data={drawn}
        curveType="stepAfter"
        stackType="stacked"
        animationType="none"
        isLoading={isLoading}
        loadingPoints={24}
        chartProps={{ margin: { top: 8, right: 8, bottom: 0, left: 0 } }}
      >
        <EvilAreaChart.Grid />
        <EvilAreaChart.XAxis
          dataKey="time"
          type="number"
          scale="time"
          domain={[start, end]}
          ticks={timeTicks(range)}
          tickFormatter={(time: number) =>
            spansDays ? formatShortDay(new Date(time)) : formatClock(new Date(time))
          }
        />
        <EvilAreaChart.YAxis
          width={44}
          ticks={yTicks}
          domain={[0, yTicks.at(-1)!]}
          tickFormatter={(value: number) => formatCount(value)}
        />
        <EvilAreaChart.Tooltip
          valueFormatter={(value) => formatCount(Number(value))}
          labelFormatter={(_, payload) => {
            const time: unknown = payload?.[0]?.payload?.time;
            if (typeof time !== "number") return null;
            return byDay ? formatDay(new Date(time)) : formatDayAndHour(new Date(time));
          }}
        />
        <EvilAreaChart.Legend align="left" />
        {/* Each fill is whole, with an edge of the surface's color: a thin gap between the two. */}
        <EvilAreaChart.Area
          dataKey="answered"
          areaProps={{ ...FILLED, dataKey: "answered", fill: "var(--color-1)" }}
        />
        <EvilAreaChart.Area
          dataKey="unanswered"
          areaProps={{ ...FILLED, dataKey: "unanswered", fill: "var(--error)" }}
        />
      </EvilAreaChart>
    </figure>
  );
}
