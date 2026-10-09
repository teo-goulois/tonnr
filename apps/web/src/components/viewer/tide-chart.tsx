import {
  useActiveTooltipLabel,
  useIsTooltipActive,
  usePlotArea,
  useXAxisScale,
  useYAxisScale,
  ZIndexLayer,
} from "@repo/ui/components/evilcharts/charts/recharts-area-chart";
import { cn } from "@repo/ui/lib/utils";
import { type ReactNode, useMemo } from "react";

import { formatClock, formatMeters, formatNumber } from "@/lib/format";

import { type ChartPoint, SeaChart } from "./sea-chart";
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
// Above the figures of the axes.
const TAG_LAYER = 2100;
// The room a time takes beside its dot, in pixels.
const LABEL_WIDTH = 40;

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
}: Pick<TideChartProps, "extremes"> & { rows: Row[]; now?: number }) {
  const plot = usePlotArea();
  const xScale = useXAxisScale();
  const yScale = useYAxisScale();
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

  // The height, written on the axis it is read from, over the figure the axis has there.
  const levelTag = pointed && (
    <ZIndexLayer zIndex={TAG_LAYER}>
      <g aria-hidden pointerEvents="none">
        <rect
          x={0}
          y={y(pointed.value) - 9}
          width={left - 4}
          height={18}
          rx={4}
          className="fill-color-1"
        />
        <text
          x={(left - 4) / 2}
          y={y(pointed.value) + 4}
          textAnchor="middle"
          fontSize={11}
          className="fill-neutral-1 font-medium tabular-nums"
        >
          {formatNumber(pointed.value)}
        </text>
      </g>
    </ZIndexLayer>
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
              <circle cx={x(now)} cy={y(nowHeight)} r={3.5} className="fill-color-1" />
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
                    <circle cx={cx} cy={cy} r={2} className="fill-color-1" />
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
      {levelTag}
    </>
  );
}

/** The tide over time, with its high and low waters and the moments it stands at one height. */
export function TideChart({ label, points, extremes, now, isLoading, className }: TideChartProps) {
  const rows = useMemo(
    () =>
      points.flatMap((point) =>
        point.value === null ? [] : [{ time: point.time.getTime(), value: point.value }],
      ),
    [points],
  );

  return (
    <SeaChart
      label={label}
      formatValue={formatMeters}
      points={points}
      isLoading={isLoading}
      headroom={36}
      footroom={32}
      tooltip={false}
      className={cn("h-56", className)}
    >
      <TideMarks rows={rows} extremes={extremes} now={now?.getTime()} />
    </SeaChart>
  );
}
