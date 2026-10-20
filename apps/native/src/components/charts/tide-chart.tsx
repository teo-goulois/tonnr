import { TIDE_COLOR, TIDE_PAST_COLOR } from "@repo/client/sea-scales";
import type { TideExtremes, TideTimeline } from "@repo/client/viewer/types";
import { Circle, Line as SkiaLine, vec } from "@shopify/react-native-skia";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, type ListViewToken, View } from "react-native";

import { Button } from "@/components/ui/button";
import { feel } from "@/components/ui/haptics";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { formatClock, formatDay } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { formatHeight, heightFigure, useUnits } from "@/lib/units";
import { m } from "@/paraglide/messages";

import { type Row, crossingsAt, heightAt, valueTicks } from "./chart-math";
import { useChartTurn } from "./chart-turn";
import { useChartReading } from "./reading";
import { type ChartGeometry, SeaChart } from "./sea-chart";

// The tide as a strip of days to swipe along, one day a page, with its high and low waters and
// the moment it is now. A press held reads a moment: the height then, a line at that level, and
// every other moment of the day the water stands at it. The strip opens on today, and asks for
// another day when it reaches either end. The web's `tide-chart.tsx` says the same.

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
// The chart's height, the room it keeps over its curve for the names of the high waters, under
// it for those of the low waters, and under that for the hours.
const CHART_HEIGHT = 192;
const HEAD = 34;
const LOW_ROOM = 30;
const FOOT = 20;
const AXIS_WIDTH = 28;
// A day is the one in view once most of it is.
const VIEWABLE = { itemVisiblePercentThreshold: 60 };

type TideChartProps = {
  // What a screen reader calls it.
  label: string;
  timeline: TideTimeline["timeline"];
  extremes: TideExtremes["extremes"];
  now: number;
  // Asks for one more day before the strip or after it, when it is swiped to an end.
  onExtend?: (direction: -1 | 1) => void;
  isLoading?: boolean;
};

/** The midnight a moment falls after, in the phone's time. */
function midnightOf(time: number) {
  const day = new Date(time);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
}

/** Where a height stands on the chart, for the figures beside the strip. */
function yOf(value: number, ticks: number[]) {
  const low = ticks[0] ?? 0;
  const span = (ticks.at(-1) ?? 1) - low || 1;
  const plot = CHART_HEIGHT - HEAD - LOW_ROOM - FOOT;
  return HEAD + plot - ((value - low) / span) * plot;
}

/** The tide's place while it loads: its day, then its strip, of the chart's own size. */
export function TideChartSkeleton() {
  const { space } = useTheme();
  return (
    <View style={{ gap: space.xxs }}>
      <View style={{ height: 32, justifyContent: "center" }}>
        <Skeleton height={13} width={64} />
      </View>
      <Skeleton height={CHART_HEIGHT} />
    </View>
  );
}

export function TideChart({
  label,
  timeline,
  extremes,
  now,
  onExtend,
  isLoading = false,
}: TideChartProps) {
  useUnits();
  const { colors, space } = useTheme();
  const isMyTurn = useChartTurn();
  const rows = useMemo<Row[]>(
    () => timeline.map((point) => ({ time: point.time.getTime(), value: point.heightMeters })),
    [timeline],
  );
  // The strip's days, from the midnight of its first moment to that of its last.
  const days = useMemo(() => {
    const first = rows[0];
    const last = rows.at(-1);
    if (!first || !last) return [];
    const list: number[] = [];
    for (let day = midnightOf(first.time); day < last.time - HOUR_MS;) {
      list.push(day);
      const next = new Date(day);
      next.setDate(next.getDate() + 1);
      day = next.getTime();
    }
    return list;
  }, [rows]);
  const ticks = useMemo(() => {
    const values = rows.map((row) => row.value);
    return values.length > 0 ? valueTicks(Math.min(0, ...values), Math.max(0, ...values)) : [0, 1];
  }, [rows]);
  const today = days.findIndex((day) => now >= day && now < day + DAY_MS);

  const [width, setWidth] = useState(0);
  // The day in view, by its midnight, so that days added before it leave it in view.
  const [shownAt, setShownAt] = useState<number>();
  const [reading, setReading] = useState<{ time: number; value: number }>();
  const [isReading, setIsReading] = useState(false);
  const list = useRef<FlatList<number>>(null);
  const found = shownAt === undefined ? -1 : days.indexOf(shownAt);
  const shownDay = found >= 0 ? found : Math.max(0, today);
  const shownStart = days[shownDay];
  const reported = useRef<number>(undefined);

  // The coefficients of the day's high waters, as a tide table prints them, where there are any.
  const coefficients =
    shownStart === undefined
      ? []
      : extremes.flatMap((extreme) => {
          const time = extreme.time.getTime();
          return time >= shownStart && time < shownStart + DAY_MS && extreme.coefficient !== null
            ? [extreme.coefficient]
            : [];
        });

  // Each day that comes in view is felt, and asks for another day once it is an end of the strip.
  const settle = useRef((_day: number | undefined, _index: number) => {});
  settle.current = (day, index) => {
    if (day === undefined || day === reported.current) return;
    if (reported.current !== undefined) feel("select");
    reported.current = day;
    setShownAt(day);
    if (index === 0) onExtend?.(-1);
    else if (index === days.length - 1) onExtend?.(1);
  };
  const onViewable = useRef(({ viewableItems }: { viewableItems: ListViewToken[] }) => {
    const first = viewableItems[0];
    if (first?.index != null) settle.current(first.item, first.index);
  });

  const goTo = (index: number, animated = true) => {
    if (index < 0 || index >= days.length) return;
    list.current?.scrollToIndex({ index, animated });
    settle.current(days[index], index);
  };

  /** A day as a screen reader hears it: its name, then its high and low waters. */
  const describe = (index: number) => {
    const start = days[index];
    if (start === undefined) return "";
    const said = extremes
      .filter((extreme) => {
        const time = extreme.time.getTime();
        return time >= start && time < start + DAY_MS;
      })
      .map(
        (extreme) =>
          `${
            extreme.type === "high"
              ? m.page_now_high_at({ time: formatClock(extreme.time) })
              : m.page_now_low_at({ time: formatClock(extreme.time) })
          }, ${formatHeight(extreme.heightMeters)}`,
      );
    return [index === today ? m.tide_today() : formatDay(new Date(start)), ...said].join(". ");
  };

  const ready = !isLoading && isMyTurn && rows.length > 1 && width > 0;

  if (isLoading) return <TideChartSkeleton />;

  return (
    <View style={{ gap: space.xxs }}>
      <View
        style={{
          minHeight: 32,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: space.xs,
        }}
      >
        <View
          style={{ flexDirection: "row", alignItems: "baseline", gap: space.xs, flexShrink: 1 }}
        >
          <Text size="s" numeric>
            {reading
              ? `${formatClock(new Date(reading.time))} · ${formatHeight(reading.value)}`
              : shownDay === today
                ? m.tide_today()
                : shownStart !== undefined
                  ? formatDay(new Date(shownStart))
                  : ""}
          </Text>
          {!reading && coefficients.length > 0 && (
            <Text size="xs" tone="muted" numeric accessibilityHint={m.tide_coefficient_title()}>
              {m.tide_coefficient({ values: coefficients.join(" · ") })}
            </Text>
          )}
        </View>
        {today >= 0 && shownDay !== today && (
          <Button variant="secondary" onPress={() => goTo(today)}>
            {m.tide_today()}
          </Button>
        )}
      </View>

      <View style={{ flexDirection: "row" }}>
        {/* The figures of the heights stay beside the strip while it is swiped. */}
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ width: AXIS_WIDTH, height: CHART_HEIGHT }}
        >
          {ready &&
            ticks.map((tick) => (
              <Text
                key={tick}
                size="xs"
                tone="muted"
                numeric
                dense
                style={{ position: "absolute", top: yOf(tick, ticks) - 8, left: 0 }}
              >
                {heightFigure(tick)}
              </Text>
            ))}
        </View>
        <View
          style={{ flex: 1, height: CHART_HEIGHT }}
          onLayout={(event) => setWidth(Math.round(event.nativeEvent.layout.width))}
          // A screen reader goes from one day to the next, and hears each day's waters.
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={label}
          accessibilityValue={{ text: describe(shownDay) }}
          accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === "increment") goTo(shownDay + 1, false);
            if (event.nativeEvent.actionName === "decrement") goTo(shownDay - 1, false);
          }}
        >
          {!ready ? (
            <Skeleton height={CHART_HEIGHT} />
          ) : (
            <FlatList
              ref={list}
              data={days}
              horizontal
              pagingEnabled
              scrollEnabled={!isReading}
              showsHorizontalScrollIndicator={false}
              keyExtractor={(day) => String(day)}
              initialScrollIndex={shownDay}
              getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
              // Days added before the one in view leave it in view.
              maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
              windowSize={3}
              initialNumToRender={1}
              maxToRenderPerBatch={2}
              onViewableItemsChanged={onViewable.current}
              viewabilityConfig={VIEWABLE}
              renderItem={({ item: day, index }) => (
                <TideDay
                  day={day}
                  past={index < today ? "all" : index > today ? "none" : "some"}
                  width={width}
                  rows={rows}
                  extremes={extremes}
                  ticks={ticks}
                  now={now}
                  grey={(index - Math.max(0, today)) % 2 !== 0}
                  ground={colors["neutral-2"]}
                  onRead={setReading}
                  onReading={setIsReading}
                />
              )}
            />
          )}
        </View>
      </View>
      <Text size="xs" tone="muted">
        {m.chart_touch_hint()}
      </Text>
    </View>
  );
}

type TideDayProps = {
  day: number;
  // How much of the day is gone: before today all of it, after today none.
  past: "all" | "some" | "none";
  width: number;
  rows: Row[];
  extremes: TideExtremes["extremes"];
  ticks: number[];
  now: number;
  grey: boolean;
  ground: string;
  onRead: (read: { time: number; value: number } | undefined) => void;
  onReading: (reading: boolean) => void;
};

/** One day of the strip: its curve, pale where the hours are gone, and its high and low waters. */
const TideDay = memo(function TideDay({
  day,
  past,
  width,
  rows,
  extremes,
  ticks,
  now,
  grey,
  ground,
  onRead,
  onReading,
}: TideDayProps) {
  const { colors } = useTheme();
  const end = day + DAY_MS;
  // The day's predictions, and one on each side, so that the curve reaches the edges.
  const own = useMemo(() => {
    const from = rows.findIndex((row) => row.time >= day);
    const to = rows.findIndex((row) => row.time > end);
    return rows.slice(Math.max(0, from - 1), to < 0 ? rows.length : to + 1);
  }, [rows, day, end]);
  const times = useMemo(() => own.map((row) => row.time), [own]);
  const [read, setRead] = useState<number>();
  const pressed = read === undefined ? undefined : own[read];

  const onIndex = useCallback(
    (at: number | undefined) => {
      setRead(at);
      const row = at === undefined ? undefined : own[at];
      onRead(row && { time: row.time, value: row.value });
    },
    [own, onRead],
  );
  const { state, isActive } = useChartReading(onIndex, (at) => own[at]?.time);
  useEffect(() => onReading(isActive), [isActive, onReading]);

  const pastUntil = past === "all" ? end : past === "some" ? now : undefined;
  const series = useMemo(
    () => [
      {
        values: own.map((row) => row.value),
        look: "solid" as const,
        color: TIDE_COLOR,
        pastUntil,
        pastColor: TIDE_PAST_COLOR,
      },
    ],
    [own, pastUntil],
  );
  const dayExtremes = useMemo(
    () =>
      extremes.filter((extreme) => {
        const time = extreme.time.getTime();
        return time > day && time < end;
      }),
    [extremes, day, end],
  );
  const nowHeight = now > day && now < end ? heightAt(rows, now) : undefined;

  const marks = useCallback(
    (geometry: ChartGeometry) => (
      <>
        {dayExtremes.map((extreme) => {
          const x = geometry.x(extreme.time.getTime());
          return (
            <SkiaLine
              key={extreme.time.getTime()}
              p1={vec(x, geometry.y(extreme.heightMeters))}
              p2={vec(x, geometry.bottom)}
              color={TIDE_COLOR}
              opacity={0.4}
              strokeWidth={1}
            />
          );
        })}
        {nowHeight !== undefined && (
          <Circle cx={geometry.x(now)} cy={geometry.y(nowHeight)} r={4} color={TIDE_COLOR} />
        )}
      </>
    ),
    [dayExtremes, nowHeight, now],
  );

  // What a finger reads: a line at its level, and the other moments of the day the water stands
  // there, each with its hour.
  const others = useMemo(() => {
    if (!pressed || read === undefined) return [];
    const step = (own[read + 1] ?? pressed).time - (own[read - 1] ?? pressed).time;
    return crossingsAt(own, pressed.value).filter(
      (crossing) =>
        Math.abs(crossing.time - pressed.time) > step &&
        crossing.time >= day &&
        crossing.time <= end,
    );
  }, [pressed, read, own, day, end]);

  const overlay = (geometry: ChartGeometry) => (
    <>
      {[6, 12, 18].map((hour) => {
        const at = new Date(day);
        at.setHours(hour);
        return (
          <Text
            key={hour}
            size="xs"
            tone="muted"
            numeric
            dense
            style={{
              position: "absolute",
              top: CHART_HEIGHT - FOOT + 2,
              left: geometry.x(at.getTime()) - 20,
              width: 40,
              textAlign: "center",
            }}
          >
            {String(hour).padStart(2, "0")}
          </Text>
        );
      })}
      {!pressed &&
        dayExtremes.map((extreme) => {
          const x = geometry.x(extreme.time.getTime());
          const y = geometry.y(extreme.heightMeters);
          // Kept whole when the water turns near an edge of the day.
          const left = Math.min(geometry.right - 64, Math.max(geometry.left, x - 32));
          return (
            <View
              key={extreme.time.getTime()}
              style={{
                position: "absolute",
                left,
                width: 64,
                top: extreme.type === "high" ? y - 32 : y + 3,
                alignItems: "center",
              }}
            >
              <Text size="xs" weight="medium" numeric dense>
                {formatClock(extreme.time)}
              </Text>
              <Text size="xs" tone="muted" numeric dense>
                {formatHeight(extreme.heightMeters)}
              </Text>
            </View>
          );
        })}
      {pressed && (
        <>
          <View
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: geometry.y(pressed.value),
              height: 1,
              backgroundColor: colors["color-1"],
            }}
          />
          {others.map((crossing) => (
            <View
              key={crossing.time}
              style={{
                position: "absolute",
                left: geometry.x(crossing.time) - 30,
                top: geometry.y(crossing.value) - 4,
                width: 60,
                alignItems: "center",
              }}
            >
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  borderWidth: 1.5,
                  borderColor: colors["color-1"],
                  backgroundColor: colors["neutral-1"],
                }}
              />
              <Text
                size="xs"
                tone="muted"
                numeric
                dense
                style={{ position: "absolute", top: crossing.rising ? -18 : 10 }}
              >
                {formatClock(new Date(crossing.time))}
              </Text>
            </View>
          ))}
          <View
            style={{
              position: "absolute",
              left: geometry.x(pressed.time) - 5,
              top: geometry.y(pressed.value) - 5,
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: TIDE_COLOR,
              borderWidth: 2,
              borderColor: colors["neutral-1"],
            }}
          />
        </>
      )}
    </>
  );

  return (
    <View style={{ width, height: CHART_HEIGHT, backgroundColor: grey ? ground : undefined }}>
      <SeaChart
        times={times}
        series={series}
        start={day}
        end={end}
        ticks={ticks}
        height={CHART_HEIGHT}
        left={0}
        top={HEAD}
        bottom={LOW_ROOM + FOOT}
        now={nowHeight === undefined ? undefined : now}
        press={state}
        marks={marks}
        overlay={overlay}
      />
    </View>
  );
});
