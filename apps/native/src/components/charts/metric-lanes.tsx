import { memo, useCallback, useMemo, useState } from "react";
import { View } from "react-native";

import { DirectionArrow, LineGlyph } from "@/components/forecast/bearing";
import {
  DAY_MS,
  HOUR_MS,
  type Metric,
  type MetricKey,
  type Sample,
  directionAt,
  formatGap,
  formatMetric,
  metricColor,
  metrics,
  valueAt,
} from "@/components/forecast/metrics";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { formatDay, formatDayAndClock, formatNumber } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { useUnits } from "@/lib/units";
import { m } from "@/paraglide/messages";

import { floorTicks, midnightsBetween, timeTicks, valueTicks } from "./chart-math";
import { useChartTurn } from "./chart-turn";
import { useChartReading } from "./reading";
import { type ChartGeometry, SeaChart } from "./sea-chart";

// The waves, their period, their energy and the wind of a buoy as lanes on one span of time,
// read together: a finger held on one reads the same moment on all of them, and each says its
// value then. The buoy's line is drawn bold over the model's dashed one. The web's
// `metric-lanes.tsx` says the same.

type Night = { from: number; to: number };

// One moment of a lane: what the model says and what the buoy measured.
type LaneRow = { time: number; model: number | null; buoy: number | null };

const LANE_HEIGHT = 96;
// The last lane is taller by the hours written under it, so that the plots are of one height.
const TIME_AXIS = 22;
const Y_AXIS = 30;
// A reading older than this no longer stands for the sea now.
const LIVE_REACH = 3 * HOUR_MS;

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
    rows.push({
      time,
      model: valueAt(model, key, time, HOUR_MS) ?? null,
      // A buoy says nothing of the hours after its last reading.
      buoy: time <= lastReading ? (valueAt(measured, key, time, HOUR_MS) ?? null) : null,
    });
  }
  return rows;
}

// Round figures from zero to just above the curves, in the unit they are written in. A period
// starts near its lowest value.
function ticksOf(metric: Metric, values: number[]) {
  if (metric.floor !== undefined) return floorTicks(values);
  if (values.length === 0) return [0, 1];
  const shown = metric.shown ?? ((value: number) => value);
  const kept = metric.kept ?? ((value: number) => value);
  return valueTicks(0, shown(Math.max(...values))).map(kept);
}

type LaneProps = {
  metric: Metric;
  measured: Sample[];
  model: Sample[];
  start: number;
  end: number;
  now: number;
  nights: Night[];
  // The moment a finger reads, on whichever lane it is.
  pointedTime: number | undefined;
  onPoint: (time: number | undefined) => void;
  // The first lane writes the moment read, the last the days under its plot.
  first: boolean;
  last: boolean;
};

const Lane = memo(function Lane({
  metric,
  measured,
  model,
  start,
  end,
  now,
  nights,
  pointedTime,
  onPoint,
  first,
  last,
}: LaneProps) {
  const { colors, space } = useTheme();
  const isMyTurn = useChartTurn();
  const rows = useMemo(
    () => rowsOf(metric.key, measured, model, start, end),
    [metric.key, measured, model, start, end],
  );
  const times = useMemo(() => rows.map((row) => row.time), [rows]);
  const hasBuoy = rows.some((row) => row.buoy !== null);
  const series = useMemo(
    () => [
      {
        values: rows.map((row) => row.model),
        look: "dashed" as const,
        scale: metric.scale,
        fill: true,
      },
      ...(hasBuoy
        ? [{ values: rows.map((row) => row.buoy), look: "solid" as const, scale: metric.scale }]
        : []),
    ],
    [rows, hasBuoy, metric.scale],
  );
  const ticks = useMemo(
    () =>
      ticksOf(
        metric,
        rows.flatMap((row) => [row.model, row.buoy].filter((value) => value !== null)),
      ),
    [metric, rows],
  );
  const midnights = useMemo(() => midnightsBetween(start, end), [start, end]);
  const onIndex = useCallback(
    (index: number | undefined) => onPoint(index === undefined ? undefined : rows[index]?.time),
    [rows, onPoint],
  );
  const { state } = useChartReading(onIndex, (index) => rows[index]?.time);

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

  const short = end - start <= 2 * DAY_MS;
  const hours = useMemo(() => timeTicks(start, end, short ? 6 : 24), [start, end, short]);
  const height = LANE_HEIGHT + (last ? TIME_AXIS : 0);

  const overlay = (geometry: ChartGeometry) => (
    <>
      {ticks.map((tick) => {
        const shown = metric.shown ? metric.shown(tick) : tick;
        return (
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
            {/* The axis has room for three figures: a thousand is written short. */}
            {shown >= 1000 ? `${formatNumber(shown / 1000)}k` : formatNumber(shown)}
          </Text>
        );
      })}
      {last &&
        hours.map((hour) => (
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
            {new Date(hour).getHours() === 12 && !short
              ? formatDay(new Date(hour))
              : String(new Date(hour).getHours()).padStart(2, "0")}
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
          {pointed.model !== null && (
            <View
              style={{
                position: "absolute",
                left: geometry.x(pointed.time) - 4,
                top: geometry.y(pointed.model) - 4,
                width: 8,
                height: 8,
                borderRadius: 4,
                borderWidth: 1.5,
                borderColor: metricColor(metric, pointed.model),
                backgroundColor: colors["neutral-1"],
              }}
            />
          )}
          {pointed.buoy !== null && (
            <View
              style={{
                position: "absolute",
                left: geometry.x(pointed.time) - 5,
                top: geometry.y(pointed.buoy) - 5,
                width: 10,
                height: 10,
                borderRadius: 5,
                borderWidth: 1.5,
                borderColor: colors["neutral-1"],
                backgroundColor: metricColor(metric, pointed.buoy),
              }}
            />
          )}
          {first && (
            <Text
              size="xs"
              weight="medium"
              numeric
              dense
              style={{
                position: "absolute",
                top: 0,
                left: Math.min(
                  Math.max(geometry.x(pointed.time) - 60, geometry.left),
                  geometry.right - 120,
                ),
                width: 120,
                textAlign: "center",
              }}
            >
              {formatDayAndClock(new Date(pointed.time))}
            </Text>
          )}
        </>
      )}
    </>
  );

  return (
    <View
      style={{ gap: 2 }}
      accessible
      accessibilityLabel={metric.label}
      accessibilityValue={{
        text: read
          ? [
              read.buoy !== null && `${m.details_buoy()} ${formatMetric(metric, read.buoy)}`,
              read.model !== null && `${m.details_model()} ${formatMetric(metric, read.model)}`,
            ]
              .filter(Boolean)
              .join(", ")
          : "",
      }}
    >
      <View
        style={{
          minHeight: 19,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: space.xs,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.xxs }}>
          <Text size="xs" tone="muted">
            {metric.label}
          </Text>
          <Text size="xs" style={{ color: colors["neutral-6"] }}>
            {metric.unit}
          </Text>
          {bearing !== undefined && (
            <DirectionArrow fromDegrees={bearing} size={12} color={colors["neutral-10"]} />
          )}
        </View>
        {read && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
            {read.buoy !== null && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.xxs }}>
                <LineGlyph color={metricColor(metric, read.buoy)} />
                <Text size="s" weight="medium" numeric dense>
                  {formatMetric(metric, read.buoy, false)}
                </Text>
              </View>
            )}
            {read.model !== null && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.xxs }}>
                <LineGlyph dashed color={metricColor(metric, read.model)} />
                <Text
                  size={read.buoy === null ? "s" : "xs"}
                  weight={read.buoy === null ? "medium" : "regular"}
                  tone={read.buoy === null ? "default" : "muted"}
                  numeric
                  dense
                >
                  {formatMetric(metric, read.model, false)}
                </Text>
              </View>
            )}
            {read.buoy !== null && read.model !== null && (
              <View
                style={{
                  minWidth: 36,
                  paddingHorizontal: space.xxs,
                  borderRadius: 9999,
                  backgroundColor: colors["neutral-3"],
                  alignItems: "center",
                }}
              >
                <Text size="xs" numeric dense>
                  {formatGap(metric, read.model, read.buoy, false)}
                </Text>
              </View>
            )}
          </View>
        )}
      </View>
      {!isMyTurn ? (
        <Skeleton height={height} />
      ) : (
        <SeaChart
          times={times}
          series={series}
          start={start}
          end={end}
          ticks={ticks}
          height={height}
          left={Y_AXIS}
          top={4}
          bottom={last ? TIME_AXIS : 2}
          nights={nights}
          midnights={midnights}
          now={now}
          press={state}
          overlay={overlay}
        />
      )}
    </View>
  );
});

type MetricLanesProps = {
  keys: MetricKey[];
  // What the buoy measured, and what the model says, oldest first.
  measured: Sample[];
  model: Sample[];
  start: number;
  end: number;
  now: number;
  nights?: Night[];
  isLoading?: boolean;
};

export function MetricLanes({
  keys,
  measured,
  model,
  start,
  end,
  now,
  nights = [],
  isLoading = false,
}: MetricLanesProps) {
  const units = useUnits();
  const { space } = useTheme();
  const [pointed, setPointed] = useState<number>();
  // The metrics are written in the reader's units.
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  const all = useMemo(() => metrics(), [units]);

  if (isLoading) {
    return (
      <View style={{ gap: space.xs }}>
        {keys.map((key, index) => (
          <Skeleton
            key={key}
            height={LANE_HEIGHT + 19 + (index === keys.length - 1 ? TIME_AXIS : 0)}
          />
        ))}
      </View>
    );
  }

  return (
    <View style={{ gap: space.xs }}>
      <Text size="xs" tone="muted">
        {m.chart_touch_hint()}
      </Text>
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
          pointedTime={pointed}
          onPoint={setPointed}
          first={index === 0}
          last={index === keys.length - 1}
        />
      ))}
    </View>
  );
}
