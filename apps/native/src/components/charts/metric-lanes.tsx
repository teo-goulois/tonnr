import { memo, useCallback, useMemo, useState } from "react";
import { View, useWindowDimensions } from "react-native";

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
import { DENSE_SCALE, Text } from "@/components/ui/text";
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
// value then. The buoy's line is drawn bold over the model's dashed one, and the room between
// them is hatched. The web's `metric-lanes.tsx` says the same.

type Night = { from: number; to: number };

// One moment of a lane: what the model says and what the buoy measured.
type LaneRow = { time: number; model: number | null; buoy: number | null };

const LANE_HEIGHT = 96;
// The last lane is taller by the hours written under it, so that the plots are of one height.
const TIME_AXIS = 22;
const Y_AXIS = 30;
// The columns a lane writes its figures in, over its plot: the buoy's, the model's, and what
// parts them, the web's `w-14`, `w-12` and `w-11`. They are the same on every lane, so the lanes
// read as a table under one legend.
const BUOY_COLUMN = 56;
const MODEL_COLUMN = 48;
const GAP_COLUMN = 44;
// The web's badge of what parts them: 20 points tall, and 36 wide at the least.
const BADGE_HEIGHT = 20;
const BADGE_WIDTH = 36;
// The moment a finger reads is written from a side of the plot nearer it than this.
const TIME_LABEL_REACH = 48;
const TIME_LABEL_WIDTH = 120;
// A reading older than this no longer stands for the sea now.
const LIVE_REACH = 3 * HOUR_MS;
// Where the phone keeps that its reader has held a lane once, as the web's browser does: the
// hint of how to read the lanes is then said no more.
const HOLD_KEY = "tonnr:chart-hold";

let knowsHold: boolean | undefined;

function storedKnowsHold() {
  try {
    return localStorage.getItem(HOLD_KEY) === "true";
  } catch {
    return false;
  }
}

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
  // While the forecast loads, a lane keeps its name and the place of its plot.
  isLoading: boolean;
  // The moment a finger reads, on whichever lane it is.
  pointedTime: number | undefined;
  onPoint: (time: number | undefined) => void;
  // The first lane writes the moment read, the last the days under its plot.
  first: boolean;
  last: boolean;
};

/**
 * The moment a finger reads, written over the first lane: from the side of the plot it is near,
 * kept inside it, and ringed in the page's color over the curves.
 */
function ReadTime({ time, geometry }: { time: number; geometry: ChartGeometry }) {
  const { colors, space } = useTheme();
  const at = Math.min(
    Math.max(geometry.x(time), geometry.left + space.xxs),
    geometry.right - space.xxs,
  );
  const side =
    at < geometry.left + TIME_LABEL_REACH
      ? "left"
      : at > geometry.right - TIME_LABEL_REACH
        ? "right"
        : "center";
  return (
    <Text
      size="xs"
      weight="medium"
      numeric
      dense
      numberOfLines={1}
      style={{
        position: "absolute",
        top: geometry.top,
        left:
          side === "left"
            ? at
            : side === "right"
              ? at - TIME_LABEL_WIDTH
              : at - TIME_LABEL_WIDTH / 2,
        width: TIME_LABEL_WIDTH,
        textAlign: side,
        textShadowColor: colors["neutral-1"],
        textShadowRadius: 3,
        textShadowOffset: { width: 0, height: 0 },
      }}
    >
      {formatDayAndClock(new Date(time))}
    </Text>
  );
}

// A column of figures, its figure at its right end.
const COLUMN = {
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "flex-end",
} as const;

const Lane = memo(function Lane({
  metric,
  measured,
  model,
  start,
  end,
  now,
  nights,
  isLoading,
  pointedTime,
  onPoint,
  first,
  last,
}: LaneProps) {
  const { colors, space, radius, type } = useTheme();
  // The head grows with the type as far as its dense figures do, and no further.
  const { fontScale } = useWindowDimensions();
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
  // The room between the buoy and the model, where both say something.
  const band = useMemo(
    () =>
      hasBuoy
        ? {
            lower: rows.map((row) =>
              row.model !== null && row.buoy !== null ? Math.min(row.model, row.buoy) : null,
            ),
            upper: rows.map((row) =>
              row.model !== null && row.buoy !== null ? Math.max(row.model, row.buoy) : null,
            ),
          }
        : undefined,
    [rows, hasBuoy],
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
            {/* A day is named under its noon, whatever the span. */}
            {new Date(hour).getHours() === 12
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
          {first && <ReadTime time={pointed.time} geometry={geometry} />}
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
      {/* Of one height, the line of the small type, whatever it writes. */}
      <View
        style={{
          height: type.s.line * Math.min(fontScale, DENSE_SCALE),
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: space.xs,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.xxs }}>
          <Text size="xs" tone="muted" dense numberOfLines={1}>
            {metric.label}
          </Text>
          <Text size="xs" dense numberOfLines={1} style={{ color: colors["neutral-6"] }}>
            {metric.unit}
          </Text>
          {bearing !== undefined && !isLoading && (
            <DirectionArrow fromDegrees={bearing} size={12} color={colors["neutral-10"]} />
          )}
        </View>
        {read && !isLoading && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
            <View style={[COLUMN, { width: BUOY_COLUMN, gap: space.xxs }]}>
              {read.buoy !== null && (
                <>
                  <LineGlyph color={metricColor(metric, read.buoy)} />
                  <Text size="s" weight="medium" numeric dense numberOfLines={1}>
                    {formatMetric(metric, read.buoy, false)}
                  </Text>
                </>
              )}
            </View>
            <View style={[COLUMN, { width: MODEL_COLUMN, gap: space.xxs }]}>
              {read.model !== null && (
                <>
                  <LineGlyph dashed color={metricColor(metric, read.model)} />
                  <Text
                    size={read.buoy === null ? "s" : "xs"}
                    weight={read.buoy === null ? "medium" : "regular"}
                    tone={read.buoy === null ? "default" : "muted"}
                    numeric
                    dense
                    numberOfLines={1}
                  >
                    {formatMetric(metric, read.model, false)}
                  </Text>
                </>
              )}
            </View>
            <View style={[COLUMN, { width: GAP_COLUMN }]}>
              {read.buoy !== null && read.model !== null && (
                <View
                  style={{
                    height: BADGE_HEIGHT,
                    minWidth: BADGE_WIDTH,
                    paddingHorizontal: space.xs,
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: radius.xs,
                    borderCurve: "continuous",
                    backgroundColor: colors["neutral-3"],
                  }}
                >
                  <Text size="xs" weight="medium" numeric dense numberOfLines={1}>
                    {formatGap(metric, read.model, read.buoy, false)}
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}
      </View>
      {isLoading || !isMyTurn ? (
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
          band={band}
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
  // How a finger reads the lanes is said until it has read them once.
  const [knows, setKnows] = useState(() => (knowsHold ??= storedKnowsHold()));
  const onPoint = useCallback(
    (time: number | undefined) => {
      setPointed(time);
      if (time === undefined || knows) return;
      knowsHold = true;
      setKnows(true);
      try {
        localStorage.setItem(HOLD_KEY, "true");
      } catch {
        // A phone that keeps nothing still says it no more until the app is closed.
      }
    },
    [knows],
  );
  // The metrics are written in the reader's units.
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  const all = useMemo(() => metrics(), [units]);

  return (
    <View style={{ gap: space.xs }}>
      {!knows && (
        <Text size="xs" tone="muted">
          {m.chart_touch_hint()}
        </Text>
      )}
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
          isLoading={isLoading}
          pointedTime={pointed}
          onPoint={onPoint}
          first={index === 0}
          last={index === keys.length - 1}
        />
      ))}
    </View>
  );
}
