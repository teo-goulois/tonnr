import { TIDE_COLOR, TIDE_PAST_COLOR } from "@repo/client/sea-scales";
import type { TideExtremes, TideTimeline } from "@repo/client/viewer/types";
import { Circle } from "@shopify/react-native-skia";
import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, type ListViewToken, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";

import { Button } from "@/components/ui/button";
import { feel } from "@/components/ui/haptics";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { formatClock, formatDay } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { formatHeight, heightFigure, useUnits } from "@/lib/units";
import { m } from "@/paraglide/messages";

import {
  type Crossing,
  type Row,
  crossingsAt,
  heightAt,
  marksRoom,
  valueTicks,
} from "./chart-math";
import { useChartTurn } from "./chart-turn";
import { useChartReading } from "./reading";
import { type ChartGeometry, SeaChart } from "./sea-chart";

// The tide as a strip of days to swipe along, one day a page, with its high and low waters and
// the moment it is now. A press held reads a moment: the height then, a line at that level, and
// every other moment of the day the water stands at it. The strip opens on today, and asks for
// another day when it reaches either end. The web's `tide-chart.tsx` says the same.

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
// The chart's height, and the room under its plot for the hours, as the web's.
const CHART_HEIGHT = 192;
const X_AXIS = 30;
// The room the name of a high water takes above its point, and that of a low water below it:
// the chart keeps over and under its curve what they lack there (`marksRoom`).
const HIGH_MARK_ROOM = 34;
const LOW_MARK_ROOM = 31;
// The column of the heights beside the strip, the web's `w-6`.
const AXIS_WIDTH = 24;
// The room a character of a mark takes, to tell whether a time fits before its dot.
const CHARACTER_WIDTH = 6.5;
// The box a time or a height is written in over the chart.
const MARK_WIDTH = 64;
// Where the plot ends and the hours begin.
const PLOT_BOTTOM = CHART_HEIGHT - X_AXIS;
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

type Room = { head: number; foot: number };

/** Where a height stands on the chart, for the figures beside the strip. */
function yOf(value: number, ticks: number[], room: Room) {
  const low = ticks[0] ?? 0;
  const span = (ticks.at(-1) ?? 1) - low || 1;
  const plot = PLOT_BOTTOM - room.head - room.foot;
  return room.head + plot - ((value - low) / span) * plot;
}

/**
 * The tide's place while it loads: its day, then its strip, then its hint, each of its own size,
 * so that nothing moves when the tide comes.
 */
export function TideChartSkeleton() {
  const { space, type } = useTheme();
  return (
    <View style={{ gap: space.xxs }}>
      <View style={{ height: 32, justifyContent: "center" }}>
        <Skeleton height={type.s.line} width={64} />
      </View>
      <Skeleton height={CHART_HEIGHT} />
      <Skeleton height={type.xs.line} width={224} />
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
  const { colors, space, radius, type } = useTheme();
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
  const room = useMemo(
    () =>
      marksRoom(
        rows.map((row) => row.value),
        PLOT_BOTTOM,
        HIGH_MARK_ROOM,
        LOW_MARK_ROOM,
      ),
    [rows],
  );
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

  // A reader who asked for no motion is taken to a day at once.
  const reducedMotion = useReducedMotion();
  const goTo = (index: number, animated = !reducedMotion) => {
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
      {/* Of one height, which the small button of today overflows: nothing moves as it comes. */}
      <View
        style={{
          height: 32,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: space.xs,
        }}
      >
        <View
          style={{ flexDirection: "row", alignItems: "baseline", gap: space.xs, flexShrink: 1 }}
        >
          {/* Said again by Android's screen reader as it changes, as the web's is. */}
          <Text size="s" numeric accessibilityLiveRegion="polite">
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
          <Button variant="secondary" size="xs" onPress={() => goTo(today)}>
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
                style={{
                  position: "absolute",
                  top: yOf(tick, ticks, room) - type.xs.line / 2,
                  left: 0,
                }}
              >
                {heightFigure(tick)}
              </Text>
            ))}
          {/* The height under the finger, over the figure the axis has there. */}
          {ready && reading && (
            <View
              style={{
                position: "absolute",
                left: 0,
                right: space.xxs,
                top: yOf(reading.value, ticks, room) - type.xs.line / 2,
                height: type.xs.line,
                justifyContent: "center",
                borderRadius: radius.xs,
                backgroundColor: colors["color-1"],
              }}
            >
              <Text
                size="xs"
                weight="medium"
                numeric
                dense
                numberOfLines={1}
                adjustsFontSizeToFit
                style={{ color: colors["neutral-1"], textAlign: "center" }}
              >
                {heightFigure(reading.value)}
              </Text>
            </View>
          )}
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
                  room={room}
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
  room: Room;
  now: number;
  grey: boolean;
  ground: string;
  onRead: (read: { time: number; value: number } | undefined) => void;
  onReading: (reading: boolean) => void;
};

/** Whether the water rises at a moment of a day's predictions, from the one after it or before. */
function risingAt(rows: Row[], index: number) {
  const here = rows[index];
  const next = rows[index + 1];
  const previous = rows[index - 1];
  if (!here) return true;
  return next ? next.value > here.value : previous ? previous.value < here.value : true;
}

/** One day of the strip: its curve, pale where the hours are gone, and its high and low waters. */
const TideDay = memo(function TideDay({
  day,
  past,
  width,
  rows,
  extremes,
  ticks,
  room,
  now,
  grey,
  ground,
  onRead,
  onReading,
}: TideDayProps) {
  const { colors, space, type } = useTheme();
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
        // The web's tide is a line of 2 over a ground of its colors.
        strokeWidth: 2,
        fill: true,
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
    (geometry: ChartGeometry) =>
      nowHeight !== undefined && (
        <Circle cx={geometry.x(now)} cy={geometry.y(nowHeight)} r={4} color={TIDE_COLOR} />
      ),
    [nowHeight, now],
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

  // Text over the curve, rimmed with the page's color so that a line under it does not cut it.
  const rim = {
    textShadowColor: colors["neutral-1"],
    textShadowRadius: 2,
    textShadowOffset: { width: 0, height: 0 },
  };
  // From the top of a line of the smallest type to where its letters stand, as the web places a
  // mark by where its letters stand.
  const baseline = type.xs.line - 3;

  // A time sits where the curve leaves room: before its dot, above the line when the water rises
  // and below when it falls. Against the left edge of the day it goes to the other side,
  // mirrored. As the web's `levelMark`.
  const levelMark = (geometry: ChartGeometry, crossing: Crossing, strong: boolean) => {
    const cx = geometry.x(crossing.time);
    const cy = geometry.y(crossing.value);
    const text = formatClock(new Date(crossing.time));
    const before = cx - 6 - text.length * CHARACTER_WIDTH >= geometry.left;
    const above = (crossing.rising === before || cy + 16 > PLOT_BOTTOM) && cy - 16 > 0;
    return (
      <Text
        key={`time-${crossing.time}`}
        size="xs"
        weight={strong ? "medium" : "regular"}
        tone={strong ? "default" : "muted"}
        numeric
        dense
        numberOfLines={1}
        style={[
          {
            position: "absolute",
            left: before ? cx - 6 - MARK_WIDTH : cx + 6,
            width: MARK_WIDTH,
            textAlign: before ? "right" : "left",
            top: (above ? cy - 6 : cy + 14) - baseline,
          },
          rim,
        ]}
      >
        {text}
      </Text>
    );
  };

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
            numberOfLines={1}
            style={{
              position: "absolute",
              top: PLOT_BOTTOM + space.xxs,
              left: geometry.x(at.getTime()) - MARK_WIDTH / 2,
              width: MARK_WIDTH,
              textAlign: "center",
            }}
          >
            {formatClock(at)}
          </Text>
        );
      })}
      {/* The high and low waters, each with its line down to the hours, its time and its height;
          a finger that reads the curve takes their place. */}
      {!pressed &&
        dayExtremes.map((extreme) => {
          const x = geometry.x(extreme.time.getTime());
          const y = geometry.y(extreme.heightMeters);
          // Kept whole when the water turns near an edge of the day.
          const left = Math.min(
            geometry.right - MARK_WIDTH,
            Math.max(geometry.left, x - MARK_WIDTH / 2),
          );
          return (
            <Fragment key={extreme.time.getTime()}>
              <View
                style={{
                  position: "absolute",
                  left: x - 0.5,
                  top: y,
                  width: 1,
                  height: Math.max(0, PLOT_BOTTOM - y),
                  backgroundColor: TIDE_COLOR,
                  opacity: 0.4,
                }}
              />
              <View
                style={{
                  position: "absolute",
                  left,
                  width: MARK_WIDTH,
                  top: extreme.type === "high" ? y - 32 : y + 3,
                  alignItems: "center",
                }}
              >
                <Text size="xs" weight="medium" numeric dense numberOfLines={1} style={rim}>
                  {formatClock(extreme.time)}
                </Text>
                <Text size="xs" tone="muted" numeric dense numberOfLines={1} style={rim}>
                  {formatHeight(extreme.heightMeters)}
                </Text>
              </View>
            </Fragment>
          );
        })}
      {pressed && read !== undefined && (
        <>
          {/* The rule down the moment read, as the web's charts draw it under a finger. */}
          <View
            style={{
              position: "absolute",
              left: geometry.x(pressed.time) - 0.5,
              top: geometry.top,
              width: 1,
              height: Math.max(0, PLOT_BOTTOM - geometry.top),
              backgroundColor: colors["neutral-10"],
              opacity: 0.5,
            }}
          />
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
                left: geometry.x(crossing.time) - 4,
                top: geometry.y(crossing.value) - 4,
                width: 8,
                height: 8,
                borderRadius: 4,
                borderWidth: 1.5,
                borderColor: colors["color-1"],
                backgroundColor: colors["neutral-1"],
              }}
            />
          ))}
          {others.map((crossing) => levelMark(geometry, crossing, false))}
          {levelMark(geometry, { ...pressed, rising: risingAt(own, read) }, true)}
          <View
            style={{
              position: "absolute",
              left: geometry.x(pressed.time) - 5.5,
              top: geometry.y(pressed.value) - 5.5,
              width: 11,
              height: 11,
              borderRadius: 5.5,
              borderWidth: 2,
              borderColor: colors["color-1"],
              backgroundColor: colors["neutral-1"],
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
        top={room.head}
        bottom={X_AXIS + room.foot}
        now={nowHeight === undefined ? undefined : now}
        // The tide's line at now is the muted grey, as the web's is.
        nowColor={colors["neutral-7"]}
        press={state}
        marks={marks}
        overlay={overlay}
      />
    </View>
  );
});
