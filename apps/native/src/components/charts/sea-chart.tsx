import type { ScaleStop } from "@repo/client/sea-scales";
import {
  DashPathEffect,
  LinearGradient,
  Line as SkiaLine,
  Rect,
  vec,
} from "@shopify/react-native-skia";
import { Fragment, type ReactNode, memo, useMemo, useState } from "react";
import { View } from "react-native";
import { Area, CartesianChart, Line, type ChartPressState, type Scale } from "victory-native";

import { useTheme } from "@/lib/theme";

import { curveGradient } from "./chart-math";
import { PRESS_INIT } from "./reading";

// A value of the sea over time drawn on Skia with victory-native: up to four curves on one span
// of time, the nights in grey, the days ruled, a dashed line at now, and what a chart adds of its
// own. What is written on it, the figures of its axes, its marks and what a finger reads, stands
// over it as text of the app's type, which Dynamic Type grows, and which the drawing does not
// wait for. The web draws the same with Recharts (`sea-chart.tsx`).

/** A curve: its values, one a moment, and how it is drawn. */
export type ChartSeries = {
  values: (number | null)[];
  // The measurement's bold line, the model's dashed one, or the thin one of the gusts.
  look: "solid" | "dashed" | "thin";
  // The colors of a scale along the curve, by its value; or one color.
  scale?: ScaleStop[];
  color?: string;
  // A faint ground under the curve, in its colors.
  fill?: boolean;
  // A curve of one color is drawn in `pastColor` up to this moment: the tide's hours gone.
  pastUntil?: number;
  pastColor?: string;
};

/** Where the plot stands in the chart, and how a moment and a value are placed on it. */
export type ChartGeometry = {
  x: Scale;
  y: Scale;
  left: number;
  right: number;
  top: number;
  bottom: number;
};

type SeaChartProps = {
  times: number[];
  series: ChartSeries[];
  start: number;
  end: number;
  // The value axis from its first figure to its last.
  ticks: number[];
  height: number;
  // The room left of the plot for the value axis, and under it for the time axis.
  left?: number;
  bottom?: number;
  top?: number;
  nights?: { from: number; to: number }[];
  // Days drawn on grey, as the tide's strip tells one day from the next.
  greyDays?: { from: number; to: number }[];
  // The midnights, ruled across the plot.
  midnights?: number[];
  now?: number;
  // Whether a finger reads it, and the press it reads with: `useChartReading`.
  press?: ChartPressState<typeof PRESS_INIT>;
  // What the chart draws on Skia of its own, over its curves.
  marks?: (geometry: ChartGeometry) => ReactNode;
  // What stands over the chart, in the app's type: its figures, its marks, what is read.
  overlay?: (geometry: ChartGeometry) => ReactNode;
};

const KEYS = ["a", "b", "c", "d"] as const;
type Datum = {
  time: number;
  a: number | null;
  b: number | null;
  c: number | null;
  d: number | null;
};

/** The strokes of the three looks, in points. */
const STROKE = { solid: 2.5, dashed: 1.5, thin: 1.25 };

const Curves = memo(function Curves({
  times,
  series,
  start,
  end,
  ticks,
  height,
  left = 30,
  bottom = 22,
  top = 6,
  nights = [],
  greyDays = [],
  midnights = [],
  now,
  press,
  marks,
  onGeometry,
}: Omit<SeaChartProps, "overlay"> & { onGeometry: (geometry: ChartGeometry) => void }) {
  const { colors } = useTheme();
  const data = useMemo<Datum[]>(
    () =>
      times.map((time, index) => ({
        time,
        a: series[0]?.values[index] ?? null,
        b: series[1]?.values[index] ?? null,
        c: series[2]?.values[index] ?? null,
        d: series[3]?.values[index] ?? null,
      })),
    [times, series],
  );
  const gradients = useMemo(
    () =>
      series.map((one) => {
        if (!one.scale) return undefined;
        const rows = times.flatMap((time, index) => {
          const value = one.values[index];
          return value == null ? [] : [{ time, value }];
        });
        return curveGradient(rows, one.scale);
      }),
    [times, series],
  );
  const low = ticks[0] ?? 0;
  const high = ticks.at(-1) ?? 1;

  return (
    <View style={{ height }}>
      <CartesianChart
        data={data}
        xKey="time"
        yKeys={[...KEYS]}
        domain={{ x: [start, end], y: [low, high] }}
        padding={{ left, right: 1, top, bottom }}
        // No axis of the library's: the figures stand over the chart in the app's type.
        yAxis={[{ lineColor: "transparent", tickCount: 0 }]}
        chartPressState={press}
        chartPressConfig={{ pan: { activateAfterLongPress: 300 } }}
        onScaleChange={(x, y) =>
          onGeometry({
            x,
            y,
            left: x.range()[0] ?? left,
            right: x.range()[1] ?? 0,
            top: y.range()[1] ?? top,
            bottom: y.range()[0] ?? 0,
          })
        }
      >
        {({ points, xScale, yScale, chartBounds }) => {
          const x = (time: number) => xScale(time);
          const plotHeight = chartBounds.bottom - chartBounds.top;
          return (
            <>
              {greyDays.map((day) => (
                <Rect
                  key={`day-${day.from}`}
                  x={x(day.from)}
                  y={chartBounds.top}
                  width={Math.max(0, x(day.to) - x(day.from))}
                  height={plotHeight}
                  color={colors["neutral-2"]}
                />
              ))}
              {nights.map((night) => {
                const from = x(Math.max(start, night.from));
                const to = x(Math.min(end, night.to));
                return (
                  <Rect
                    key={`night-${night.from}`}
                    x={from}
                    y={chartBounds.top}
                    width={Math.max(0, to - from)}
                    height={plotHeight}
                    color={colors["neutral-2"]}
                  />
                );
              })}
              {ticks.map((tick) => (
                <SkiaLine
                  key={`tick-${tick}`}
                  p1={vec(chartBounds.left, yScale(tick))}
                  p2={vec(chartBounds.right, yScale(tick))}
                  color={colors["neutral-3"]}
                  strokeWidth={1}
                />
              ))}
              {midnights.map((midnight) => (
                <SkiaLine
                  key={`midnight-${midnight}`}
                  p1={vec(x(midnight), chartBounds.top)}
                  p2={vec(x(midnight), chartBounds.bottom)}
                  color={colors["neutral-4"]}
                  strokeWidth={1}
                />
              ))}
              {series.map((one, index) => {
                const key = KEYS[index]!;
                const gradient = gradients[index];
                const color = one.color ?? colors["neutral-7"];
                // The part of the span that is gone, from its start: none, some, or all of it.
                const past =
                  one.pastUntil === undefined
                    ? 0
                    : Math.min(1, Math.max(0, (one.pastUntil - start) / (end - start)));
                const shade = gradient ? (
                  <LinearGradient
                    start={vec(x(gradient.from), 0)}
                    end={vec(x(gradient.to), 0)}
                    colors={gradient.colors}
                    positions={gradient.positions}
                  />
                ) : past > 0 && one.pastColor ? (
                  <LinearGradient
                    start={vec(x(start), 0)}
                    end={vec(x(end), 0)}
                    colors={[one.pastColor, one.pastColor, color, color]}
                    positions={[0, past, past, 1]}
                  />
                ) : null;
                return (
                  <Fragment key={key}>
                    {one.fill && (
                      <Area
                        points={points[key]}
                        y0={chartBounds.bottom}
                        curveType="monotoneX"
                        color={color}
                        opacity={0.18}
                      >
                        {shade}
                      </Area>
                    )}
                    <Line
                      points={points[key]}
                      curveType="monotoneX"
                      color={color}
                      strokeWidth={STROKE[one.look]}
                      strokeCap="round"
                    >
                      {shade}
                      {one.look === "dashed" && <DashPathEffect intervals={[3, 3]} />}
                    </Line>
                  </Fragment>
                );
              })}
              {now !== undefined && now > start && now < end && (
                <SkiaLine
                  p1={vec(x(now), chartBounds.top)}
                  p2={vec(x(now), chartBounds.bottom)}
                  color={colors["neutral-7"]}
                  strokeWidth={1}
                >
                  <DashPathEffect intervals={[3, 3]} />
                </SkiaLine>
              )}
              {marks?.({
                x: xScale,
                y: yScale,
                left: chartBounds.left,
                right: chartBounds.right,
                top: chartBounds.top,
                bottom: chartBounds.bottom,
              })}
            </>
          );
        }}
      </CartesianChart>
    </View>
  );
});

/**
 * A chart of the sea over time. The curves are drawn again only when what they draw changes:
 * what a finger reads moves the text over them, not the drawing.
 */
export function SeaChart({ overlay, ...props }: SeaChartProps) {
  const [geometry, setGeometry] = useState<ChartGeometry>();
  return (
    <View style={{ height: props.height }}>
      <Curves {...props} onGeometry={setGeometry} />
      {geometry && overlay && (
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        >
          {overlay(geometry)}
        </View>
      )}
    </View>
  );
}
