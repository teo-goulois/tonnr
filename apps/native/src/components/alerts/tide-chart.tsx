import type { TidePoint } from "@repo/client/alerts/tide-band";
import { TIDE_COLOR } from "@repo/client/sea-scales";
import { tideSegmentAt } from "@repo/conditions/spots/criteria";
import type { TideSegment } from "@repo/config/sea-words";
import { Canvas, DashPathEffect, Line, Path, vec } from "@shopify/react-native-skia";
import { useMemo, useState } from "react";
import { View } from "react-native";

import { Text } from "@/components/ui/text";
import { formatDay } from "@/lib/format";
import { useTheme } from "@/lib/theme";

// The tide at the place over the two days ahead, as it will really run, with the hours that the
// parts of the cycle asked for take shaded under the curve: the dial says what is asked, and
// this says when it comes and for how long. A line at each midnight, named by its day. Drawn
// with Skia. A screen reader is told what it shows in a sentence. Decision 031, "The tide".

const HEIGHT = 96;
const TOP = 10;
const BOTTOM = 22;

type Extremes = Parameters<typeof tideSegmentAt>[2];

type AlertTideChartProps = {
  /** The tide from now on, over two days. */
  tide: readonly TidePoint[];
  extremes: Extremes;
  /** The parts of the cycle each ask of the tide takes. */
  cycles: readonly (readonly TideSegment[])[];
  zone: string | undefined;
  /** What a screen reader is told of it. */
  label: string;
};

export function AlertTideChart({ tide, extremes, cycles, zone, label }: AlertTideChartProps) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);

  const drawn = useMemo(() => {
    if (tide.length < 2 || width === 0) return null;
    const first = tide[0]!.time.getTime();
    const last = tide.at(-1)!.time.getTime();
    const values = tide.map((point) => point.value);
    const low = Math.min(...values);
    const high = Math.max(...values);
    const x = (time: number) => ((time - first) / (last - first || 1)) * width;
    const y = (value: number) =>
      TOP + (1 - (value - low) / (high - low || 1)) * (HEIGHT - TOP - BOTTOM);
    const curve = tide
      .map(
        (point, index) =>
          `${index === 0 ? "M" : "L"}${x(point.time.getTime()).toFixed(1)},${y(point.value).toFixed(1)}`,
      )
      .join(" ");
    // The runs of the curve in a part that is asked, each as an area down to the curve's foot.
    const meets = tide.map((point) => {
      const segment = tideSegmentAt(point.time, point.value, extremes);
      return segment !== null && cycles.some((cycle) => cycle.includes(segment));
    });
    const foot = HEIGHT - BOTTOM;
    const runs: { area: string; line: string }[] = [];
    let run: TidePoint[] = [];
    const close = () => {
      if (run.length > 1) {
        const line = run.map(
          (point) => `${x(point.time.getTime()).toFixed(1)},${y(point.value).toFixed(1)}`,
        );
        const start = x(run[0]!.time.getTime()).toFixed(1);
        const end = x(run.at(-1)!.time.getTime()).toFixed(1);
        runs.push({
          area: `M${start},${foot} L${line.join(" L")} L${end},${foot} Z`,
          line: `M${line.join(" L")}`,
        });
      }
      run = [];
    };
    tide.forEach((point, index) => {
      if (meets[index]) run.push(point);
      else close();
    });
    close();
    // The midnights the curve crosses, read in the account's zone.
    const days: { at: number; name: string }[] = [];
    for (let index = 1; index < tide.length; index++) {
      const before = tide[index - 1]!.time;
      const now = tide[index]!.time;
      if (formatDay(before, zone) !== formatDay(now, zone)) {
        days.push({ at: x(now.getTime()), name: formatDay(now, zone) });
      }
    }
    return { curve, runs, days };
  }, [tide, extremes, cycles, width, zone]);

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={{ height: HEIGHT }}
    >
      {drawn ? (
        <>
          <Canvas style={{ width, height: HEIGHT }}>
            {drawn.days.map((day) => (
              <Line
                key={day.at}
                p1={vec(day.at, TOP - 6)}
                p2={vec(day.at, HEIGHT - BOTTOM)}
                color={colors["neutral-5"]}
                strokeWidth={1}
              >
                <DashPathEffect intervals={[3, 3]} />
              </Line>
            ))}
            {drawn.runs.map((run) => (
              <Path key={run.area} path={run.area} color={TIDE_COLOR} opacity={0.35} />
            ))}
            <Path
              path={drawn.curve}
              style="stroke"
              strokeWidth={2}
              strokeJoin="round"
              strokeCap="round"
              color={cycles.length > 0 ? colors["neutral-6"] : TIDE_COLOR}
            />
            {drawn.runs.map((run) => (
              // The asked part of the curve itself, in the tide's color over the grey.
              <Path
                key={run.line}
                path={run.line}
                style="stroke"
                strokeWidth={2.5}
                strokeJoin="round"
                strokeCap="round"
                color={TIDE_COLOR}
              />
            ))}
          </Canvas>
          {drawn.days.map((day) => (
            <View
              key={day.at}
              pointerEvents="none"
              style={{ position: "absolute", left: day.at + 4, bottom: 2 }}
            >
              <Text size="xs" tone="muted" dense numberOfLines={1}>
                {day.name}
              </Text>
            </View>
          ))}
        </>
      ) : null}
    </View>
  );
}
