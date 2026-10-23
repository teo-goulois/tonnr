import {
  type Asked,
  type WeekPiece,
  type WeekState,
  hourIn,
  pieceFigures,
  weekDays,
} from "@repo/client/alerts/editing";
import type { TideSegment } from "@repo/config/sea-words";
import { ChevronDownIcon } from "@repo/ui/icon";
import { useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { Glyph } from "@/components/shared/glyph";
import { edge } from "@/components/ui/edge";
import { feel } from "@/components/ui/haptics";
import { Surface } from "@/components/ui/surface";
import { Text } from "@/components/ui/text";
import { formatClock, formatDay, formatNumber, formatSeconds, toKnots } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { formatHeight, formatWind, useUnits } from "@/lib/units";
import { m } from "@/paraglide/messages";

import { SEGMENT_WORDS } from "./words";

// What an alert would tell over the week ahead, as the web's `WeekPreview` says it under the
// sentence: in an outline, a line with the windows and the days that have one, a dot for each
// day, which opens on the hours of the day marked over seven lines, each day a bar of its hours,
// and a day on its windows, said in the figures the alert asks and no other; then what else there
// is to say. While nothing can be judged yet it says why, and nothing more. And the count a part's
// sheet shows as its controls move, with what they won or lost since it opened. Decision 031,
// "The editor".

const HOUR_MS = 60 * 60 * 1000;
// The day's column and the hours', as the web's grid lays them: 2.75rem and 2.5rem.
const DAY_COLUMN = 44;
const HOURS_COLUMN = 40;
// The hours marked over the days.
const MARKS = [6, 12, 18] as const;

/** How many windows, in words. */
export function countWords(count: number) {
  if (count === 0) return m.alert_week_none();
  return count === 1 ? m.alert_week_one() : m.alert_week_many({ count });
}

/** The figures of a window, written in the app's units and words. */
const WRITERS = {
  height: formatHeight,
  seconds: formatSeconds,
  swell: (height: number) => m.alert_preview_swell({ height: formatHeight(height) }),
  wind: (speed: number) => formatWind(toKnots(speed)),
  segment: (segment: TideSegment) => SEGMENT_WORDS[segment](),
  coefficient: (value: number) => m.alert_week_coefficient({ value: formatNumber(value, 0) }),
};

/** A row of seven dots, filled for a day that has a window, which the words beside it say. */
export function DayDots({ days }: { days: readonly boolean[] }) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ flexDirection: "row", gap: 3 }}
    >
      {days.map((on, at) => (
        <View
          // The days are in order, and nothing else tells them apart.
          // oxlint-disable-next-line react/no-array-index-key
          key={at}
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: on ? colors["neutral-10"] : colors["neutral-4"],
          }}
        />
      ))}
    </View>
  );
}

/**
 * The count of windows, in what changes a part, with what the moves made there won or lost:
 * `since` is the count as the part opened.
 */
export function LiveCount({
  week,
  since,
}: {
  week: { count: number | null; days: readonly boolean[] };
  since: number | null;
}) {
  const { colors, space, radius } = useTheme();
  // Before the part asks anything there is no count: its place is kept, empty, so that the first
  // value chosen moves nothing under it.
  const isCounted = week.count !== null;
  const delta = since === null || week.count === null ? 0 : week.count - since;
  const said = countWords(week.count ?? 0);
  const change =
    delta > 0
      ? m.native_alert_week_delta_more({ count: delta })
      : delta < 0
        ? m.native_alert_week_delta_fewer({ count: -delta })
        : undefined;
  return (
    <View
      accessible={isCounted}
      accessibilityElementsHidden={!isCounted}
      importantForAccessibility={isCounted ? "auto" : "no-hide-descendants"}
      accessibilityLiveRegion="polite"
      accessibilityLabel={change ? `${said}, ${change}` : said}
      style={{
        opacity: isCounted ? 1 : 0,
        flexDirection: "row",
        alignItems: "center",
        gap: space.xs,
        paddingHorizontal: space.s,
        paddingVertical: space.xs,
        borderRadius: radius.s,
        borderCurve: "continuous",
        backgroundColor: colors["neutral-2"],
      }}
    >
      <DayDots days={week.days} />
      <Text size="s" weight="medium" numeric style={{ flexShrink: 1 }}>
        {said}
        {delta !== 0 ? (
          // Beside the count, a small step after it, as the web's `ms-xxs`.
          <Text
            size="s"
            weight="medium"
            numeric
            style={{ color: delta > 0 ? colors["neutral-10"] : colors["neutral-8"] }}
          >
            {delta > 0 ? ` +${delta}` : ` −${-delta}`}
          </Text>
        ) : null}
      </Text>
    </View>
  );
}

type WeekPreviewProps = {
  state: WeekState;
  pieces: WeekPiece[];
  asked: Asked;
  now: number;
  zone: string | undefined;
  /** The name of a place, for an alert on several: undefined for one on one place. */
  nameOf?: (placeId: string) => string;
  /** What else there is to say: an older forecast, a place with no tide. */
  notes: string[];
};

export function WeekPreview({ state, pieces, asked, now, zone, nameOf, notes }: WeekPreviewProps) {
  const { colors, space, radius, type, motion } = useTheme();
  useUnits();
  const still = useReducedMotion();
  const [isOpen, setOpen] = useState(false);
  const [day, setDay] = useState<string | null>(null);
  const days = useMemo(() => weekDays(pieces, now, zone, formatDay), [pieces, now, zone]);
  // The chevron turns as the week opens, on the theme's motion, as the web's `transition-transform`.
  const turn = useSharedValue(0);
  useEffect(() => {
    const to = isOpen ? 180 : 0;
    turn.set(
      still
        ? to
        : withTiming(to, {
            duration: motion.duration,
            easing: Easing.bezier(
              motion.easing[0],
              motion.easing[1],
              motion.easing[2],
              motion.easing[3],
            ),
          }),
    );
  }, [isOpen, still, turn, motion]);
  const turned = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.get()}deg` }] }));

  // The line of the week is as tall whatever it says, so that what stands under it does not move
  // as the forecast is read or a condition is chosen: its two lines and its room.
  const lineHeight = type.m.line + type.xs.line + 2 * space.s;

  if (state !== "ready") {
    const words = {
      nothing: m.alert_preview_no_condition(),
      failed: m.alert_preview_failed(),
      pending: m.alert_preview_pending(),
      noSea: m.alert_preview_no_sea(),
    }[state];
    return (
      // As tall as the week's line, so that what stands under it does not move once it is read.
      <View style={{ minHeight: lineHeight, justifyContent: "center" }}>
        <Text size="s" tone="muted" accessibilityLiveRegion="polite">
          {words}
        </Text>
      </View>
    );
  }

  const ringing = days.filter((one) => one.pieces.length > 0).length;
  const nowHour = hourIn(new Date(now), zone);
  const daysWords = ringing === 1 ? m.alert_week_days_one() : m.alert_week_days({ count: ringing });
  // A day's line is one line of the small type, as on the web: a finger finds it over the room
  // between two lines too.
  const reach = space.xs / 2;

  return (
    <View style={{ gap: space.xs }}>
      <Surface
        variant="outline"
        radius="s"
        insetEdge
        accessibilityLiveRegion="polite"
        // The web's box has a border of a point, not the fine edge of a tile.
        style={[{ overflow: "hidden" }, edge(colors["neutral-4"], { inset: true, width: 1 })]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            pieces.length > 0 ? `${countWords(pieces.length)}, ${daysWords}` : countWords(0)
          }
          accessibilityHint={m.native_alert_week_open()}
          accessibilityState={{ expanded: isOpen }}
          onPress={() => {
            feel("select");
            setOpen((open) => !open);
          }}
          style={({ pressed }) => ({
            minHeight: lineHeight,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: space.s,
            padding: space.s,
            borderRadius: radius.s,
            borderCurve: "continuous",
            backgroundColor: pressed ? colors["neutral-3-transparent"] : undefined,
          })}
        >
          <View style={{ flexShrink: 1 }}>
            <Text weight="medium">{countWords(pieces.length)}</Text>
            {pieces.length > 0 ? (
              <Text size="xs" tone="muted">
                {daysWords}
              </Text>
            ) : null}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.s }}>
            <DayDots days={days.map((one) => one.pieces.length > 0)} />
            <Animated.View style={turned}>
              <Glyph icon={ChevronDownIcon} size={16} color={colors["neutral-7"]} />
            </Animated.View>
          </View>
        </Pressable>

        {isOpen ? (
          <View style={{ paddingHorizontal: space.s, paddingBottom: space.s, gap: space.xs }}>
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{ flexDirection: "row", gap: space.xs }}
            >
              <View style={{ width: DAY_COLUMN }} />
              <View style={{ flex: 1, height: 12 }}>
                {MARKS.map((hour) => (
                  // Centred on its hour: as wide as the hour's figures may be, and half of it back.
                  <View
                    key={hour}
                    style={{
                      position: "absolute",
                      left: `${(hour / 24) * 100}%`,
                      width: 24,
                      marginLeft: -12,
                      alignItems: "center",
                    }}
                  >
                    <Text size="xxs" tone="muted" numeric dense>
                      {hour}
                    </Text>
                  </View>
                ))}
              </View>
              <View style={{ width: HOURS_COLUMN }} />
            </View>
            {days.map((one, at) => {
              const total = one.pieces.reduce(
                (sum, piece) => sum + (piece.end.getTime() - piece.start.getTime()) / HOUR_MS,
                0,
              );
              const hours = Math.round(total);
              const isDay = day === one.key;
              const has = one.pieces.length > 0;
              return (
                <View key={one.key} style={{ gap: space.xxs }}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      has
                        ? m.native_alert_day_hours({
                            day: one.key,
                            hours: m.alert_hours({ count: hours }),
                          })
                        : m.native_alert_day_none({ day: one.key })
                    }
                    accessibilityState={{ expanded: has ? isDay : undefined, disabled: !has }}
                    disabled={!has}
                    hitSlop={{ top: reach, bottom: reach }}
                    onPress={() => {
                      feel("select");
                      setDay(isDay ? null : one.key);
                    }}
                    style={{
                      minHeight: type.s.line,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: space.xs,
                    }}
                  >
                    <Text
                      size="s"
                      tone={has ? "default" : "muted"}
                      dense
                      numberOfLines={1}
                      style={{ width: DAY_COLUMN }}
                    >
                      {one.key}
                    </Text>
                    <View
                      style={{
                        flex: 1,
                        height: 14,
                        borderRadius: 7,
                        backgroundColor: colors["neutral-3"],
                      }}
                    >
                      {one.pieces.map((piece) => {
                        const from = hourIn(piece.start, zone);
                        const to =
                          formatDay(piece.end, zone) === one.key ? hourIn(piece.end, zone) : 24;
                        return (
                          <View
                            key={`${piece.spotId}-${piece.start.getTime()}`}
                            style={{
                              position: "absolute",
                              top: 0,
                              bottom: 0,
                              left: `${(from / 24) * 100}%`,
                              right: `${100 - (to / 24) * 100}%`,
                              borderRadius: 7,
                              backgroundColor: colors["neutral-10"],
                            }}
                          />
                        );
                      })}
                      {at === 0 ? (
                        <View
                          style={{
                            position: "absolute",
                            top: -4,
                            bottom: -4,
                            width: 2,
                            borderRadius: 1,
                            left: `${(nowHour / 24) * 100}%`,
                            backgroundColor: colors["neutral-7"],
                          }}
                        />
                      ) : null}
                    </View>
                    <Text
                      size="s"
                      weight={has ? "medium" : "regular"}
                      tone={has ? "default" : "muted"}
                      numeric
                      dense
                      style={{ width: HOURS_COLUMN, textAlign: "right" }}
                    >
                      {has ? m.alert_hours({ count: hours }) : "—"}
                    </Text>
                  </Pressable>
                  {isDay ? (
                    <View
                      style={{
                        marginLeft: DAY_COLUMN + space.xs,
                        gap: space.xxs,
                        paddingHorizontal: space.s,
                        paddingVertical: space.xs,
                        borderRadius: radius.s,
                        borderCurve: "continuous",
                        backgroundColor: colors["neutral-2"],
                      }}
                    >
                      {one.pieces.map((piece) => (
                        <Text key={`${piece.spotId}-${piece.start.getTime()}`} size="xs">
                          {nameOf ? `${nameOf(piece.spotId)} · ` : ""}
                          <Text size="xs" weight="medium" numeric>
                            {formatClock(piece.start, zone)} – {formatClock(piece.end, zone)}
                          </Text>
                          {pieceFigures(piece, asked, WRITERS).map((figure) => (
                            <Text key={figure} size="xs" style={{ color: colors["neutral-8"] }}>
                              {` · ${figure}`}
                            </Text>
                          ))}
                        </Text>
                      ))}
                    </View>
                  ) : null}
                </View>
              );
            })}
            <Text size="xxs" tone="muted">
              {m.alert_week_hint()}
            </Text>
          </View>
        ) : null}
      </Surface>
      {notes.map((note) => (
        <Text key={note} size="xs" tone="muted">
          {note}
        </Text>
      ))}
    </View>
  );
}
