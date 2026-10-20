import { WIND_SPEED_SCALE } from "@repo/client/sea-scales";
import { type WindRow, bearingsAlong, rowNear } from "@repo/client/viewer/wind";
import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";

import { DirectionArrow, LineGlyph } from "@/components/forecast/bearing";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { formatClock, formatDay, formatDayAndClock } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { knotsFrom, useUnits, windFigure, windIn, windUnit } from "@/lib/units";
import { m } from "@/paraglide/messages";

import { midnightsBetween, timeTicks, valueTicks } from "./chart-math";
import { useChartTurn } from "./chart-turn";
import { useChartReading } from "./reading";
import { type ChartGeometry, SeaChart } from "./sea-chart";

// The wind of a station that measures the wind alone: its wind as a bold line in the colors of
// the wind's scale, its gusts as a thin one, and the model's wind dashed, which goes on past now.
// A press held reads a moment: the station's figures then and the model's. Under the plot, where
// the wind came from along the span. The web's `wind-chart.tsx` says the same.

const HEIGHT = 190;
const Y_AXIS = 30;
const X_AXIS = 22;
// How many bearings are drawn under the plot, from its start to its end.
const BEARINGS = 12;

type WindChartProps = {
  // The wind over the span, oldest first: the station's rows with the model's beside them.
  rows: WindRow[];
  start: number;
  end: number;
  now: number;
  nights?: { from: number; to: number }[];
  isLoading?: boolean;
};

export function WindChart({
  rows,
  start,
  end,
  now,
  nights = [],
  isLoading = false,
}: WindChartProps) {
  const units = useUnits();
  const { colors, space } = useTheme();
  const isMyTurn = useChartTurn();
  const [pointed, setPointed] = useState<WindRow>();
  const readable = useMemo(
    () => rows.filter((row) => row.wind !== null || row.model !== null || row.gust !== null),
    [rows],
  );
  const times = useMemo(() => readable.map((row) => row.time), [readable]);
  const hasGusts = readable.some((row) => row.gust !== null);
  const hasModel = readable.some((row) => row.model !== null);
  const series = useMemo(
    () => [
      {
        values: readable.map((row) => row.model),
        look: "dashed" as const,
        color: colors["neutral-7"],
      },
      { values: readable.map((row) => row.gust), look: "thin" as const, scale: WIND_SPEED_SCALE },
      {
        values: readable.map((row) => row.wind),
        look: "solid" as const,
        scale: WIND_SPEED_SCALE,
        fill: true,
      },
    ],
    [readable, colors],
  );
  // Round figures in the reader's unit, set where they stand among the knots the curves are in.
  const ticks = useMemo(
    () =>
      valueTicks(
        0,
        windIn(
          Math.max(
            1,
            ...readable.map((row) => Math.max(row.wind ?? 0, row.gust ?? 0, row.model ?? 0)),
          ),
        ),
      ).map((tick) => knotsFrom(tick)),
    // The figures are written in the reader's unit.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [readable, units],
  );
  const days = end - start > 12 * 60 * 60 * 1000;
  const hours = useMemo(() => timeTicks(start, end, days ? 24 : 2), [start, end, days]);
  const midnights = useMemo(() => midnightsBetween(start, end), [start, end]);
  const bearings = useMemo(() => bearingsAlong(rows, start, end, BEARINGS), [rows, start, end]);
  // From there on the bearings are the model's, drawn paler.
  const lastMeasured = rows.filter((row) => row.wind !== null).at(-1)?.time ?? -Infinity;

  const onIndex = useCallback(
    (index: number | undefined) => {
      const time = index === undefined ? undefined : readable[index]?.time;
      setPointed(time === undefined ? undefined : rowNear(readable, time));
    },
    [readable],
  );
  const { state } = useChartReading(onIndex, (index) => readable[index]?.time);

  if (!isLoading && readable.length < 2) {
    return (
      <View style={{ height: HEIGHT, justifyContent: "center" }}>
        <Text size="s" tone="muted">
          {m.chart_too_few_points()}
        </Text>
      </View>
    );
  }

  const overlay = (geometry: ChartGeometry) => (
    <>
      {ticks.map((tick) => (
        <Text
          key={tick}
          size="xs"
          tone="muted"
          numeric
          dense
          style={{
            position: "absolute",
            left: 0,
            width: Y_AXIS - 4,
            textAlign: "right",
            top: geometry.y(tick) - 8,
          }}
        >
          {windFigure(tick)}
        </Text>
      ))}
      {hours.map((hour) => (
        <Text
          key={hour}
          size="xs"
          tone="muted"
          numeric
          dense
          style={{
            position: "absolute",
            top: geometry.bottom + 4,
            left: geometry.x(hour) - 28,
            width: 56,
            textAlign: "center",
          }}
        >
          {days ? formatDay(new Date(hour)) : formatClock(new Date(hour))}
        </Text>
      ))}
      {pointed && (
        <>
          <View
            style={{
              position: "absolute",
              left: geometry.x(pointed.time) - 0.5,
              top: geometry.top,
              height: geometry.bottom - geometry.top,
              width: 1,
              backgroundColor: colors["neutral-10"],
              opacity: 0.5,
            }}
          />
          {pointed.wind !== null && (
            <View
              style={{
                position: "absolute",
                left: geometry.x(pointed.time) - 5,
                top: geometry.y(pointed.wind) - 5,
                width: 10,
                height: 10,
                borderRadius: 5,
                borderWidth: 1.5,
                borderColor: colors["neutral-1"],
                backgroundColor: colors["neutral-10"],
              }}
            />
          )}
        </>
      )}
    </>
  );

  return (
    <View style={{ gap: space.xxs }}>
      <Text size="xs" tone="muted">
        {m.chart_touch_hint()}
      </Text>
      {/* What the chart reads: what is under the finger, or the legend of its lines at rest. */}
      <View
        accessibilityLiveRegion="polite"
        style={{
          minHeight: 19,
          flexDirection: "row",
          alignItems: "center",
          flexWrap: "wrap",
          gap: space.s,
        }}
      >
        {pointed ? (
          <>
            <Text size="xs" weight="medium" numeric>
              {formatDayAndClock(new Date(pointed.time))}
            </Text>
            {pointed.wind !== null && (
              <Legend label={`${windFigure(pointed.wind)} ${windUnit()}`} strong />
            )}
            {pointed.gust !== null && (
              <Legend label={m.details_gusts_to({ speed: windFigure(pointed.gust) })} thin />
            )}
            {pointed.model !== null && (
              <Legend label={`${m.details_model()} ${windFigure(pointed.model)}`} dashed />
            )}
            {pointed.direction !== null && (
              <DirectionArrow
                fromDegrees={pointed.direction}
                size={12}
                color={colors["neutral-10"]}
              />
            )}
          </>
        ) : (
          <>
            <Legend label={m.details_wind()} strong />
            {hasGusts && <Legend label={m.details_gusts()} thin />}
            {hasModel && <Legend label={m.details_model()} dashed />}
          </>
        )}
      </View>
      {isLoading || !isMyTurn ? (
        <Skeleton height={HEIGHT} />
      ) : (
        <View accessible accessibilityLabel={m.details_wind()}>
          <SeaChart
            times={times}
            series={series}
            start={start}
            end={end}
            ticks={ticks}
            height={HEIGHT}
            left={Y_AXIS}
            top={6}
            bottom={X_AXIS}
            nights={nights}
            midnights={midnights}
            now={now}
            press={state}
            overlay={overlay}
          />
        </View>
      )}
      {!isLoading && (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ flexDirection: "row", marginLeft: Y_AXIS, marginRight: 1, height: 16 }}
        >
          {bearings.map((bearing, index) => {
            const from = start + (index * (end - start)) / BEARINGS;
            return (
              <View
                // The parts of a span keep their place.
                // oxlint-disable-next-line react/no-array-index-key
                key={index}
                style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
              >
                {bearing !== null && (
                  <DirectionArrow
                    fromDegrees={bearing}
                    size={12}
                    color={from > lastMeasured ? colors["neutral-6"] : colors["neutral-8"]}
                  />
                )}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

/** A line of the chart and what it is, or what it reads. */
function Legend({
  label,
  strong = false,
  thin = false,
  dashed = false,
}: {
  label: string;
  strong?: boolean;
  thin?: boolean;
  dashed?: boolean;
}) {
  const { space } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.xxs }}>
      <LineGlyph thin={thin} dashed={dashed} />
      <Text size="xs" tone={strong ? "default" : "muted"} numeric dense>
        {label}
      </Text>
    </View>
  );
}
