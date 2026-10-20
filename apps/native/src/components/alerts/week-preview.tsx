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
import { useMemo, useState } from "react";
import { LayoutAnimation, Pressable, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";

import { Glyph } from "@/components/shared/glyph";
import { feel } from "@/components/ui/haptics";
import { TARGET } from "@/components/ui/metrics";
import { Surface } from "@/components/ui/surface";
import { Text } from "@/components/ui/text";
import { formatClock, formatDay, formatNumber, formatSeconds, toKnots } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { formatHeight, formatWind, useUnits } from "@/lib/units";
import { m } from "@/paraglide/messages";

import { SEGMENT_WORDS } from "./words";

// What an alert would tell over the week ahead, as the web's `WeekPreview` says it under the
// sentence: a line with the windows and the days that have one, a dot for each day, which opens
// on the seven days, each a bar of its hours, and a day on its windows, said in the figures the
// alert asks and no other. And the count a part's sheet shows as its controls move, with what
// they won or lost since it opened. Decision 031, "The editor".

const HOUR_MS = 60 * 60 * 1000;

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
  if (week.count === null) return null;
  const delta = since === null ? 0 : week.count - since;
  const said = countWords(week.count);
  const change =
    delta > 0
      ? m.native_alert_week_delta_more({ count: delta })
      : delta < 0
        ? m.native_alert_week_delta_fewer({ count: -delta })
        : undefined;
  return (
    <View
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={change ? `${said}, ${change}` : said}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: space.xs,
        paddingHorizontal: space.s,
        paddingVertical: space.xs,
        borderRadius: radius.xs,
        borderCurve: "continuous",
        backgroundColor: colors["neutral-2"],
      }}
    >
      <DayDots days={week.days} />
      <Text size="s" weight="medium" numeric>
        {said}
      </Text>
      {delta !== 0 ? (
        <Text
          size="s"
          weight="medium"
          numeric
          style={{ color: delta > 0 ? colors["neutral-10"] : colors["neutral-8"] }}
        >
          {delta > 0 ? `+${delta}` : `−${-delta}`}
        </Text>
      ) : null}
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
  /** Whose forecast it is. */
  credit?: string;
};

export function WeekPreview({
  state,
  pieces,
  asked,
  now,
  zone,
  nameOf,
  notes,
  credit,
}: WeekPreviewProps) {
  const { colors, space } = useTheme();
  useUnits();
  const reduced = useReducedMotion();
  const [isOpen, setOpen] = useState(false);
  const [day, setDay] = useState<string | null>(null);
  const days = useMemo(() => weekDays(pieces, now, zone, formatDay), [pieces, now, zone]);
  const animate = () => {
    if (!reduced) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  };

  const footer = (
    <>
      {notes.map((note) => (
        <Text key={note} size="xs" tone="muted">
          {note}
        </Text>
      ))}
      {credit ? (
        <Text size="xs" tone="muted">
          {credit}
        </Text>
      ) : null}
    </>
  );

  if (state !== "ready") {
    const words = {
      nothing: m.alert_preview_no_condition(),
      failed: m.alert_preview_failed(),
      pending: m.alert_preview_pending(),
      noSea: m.alert_preview_no_sea(),
    }[state];
    return (
      <View style={{ gap: space.xs }}>
        <Text size="s" tone="muted" accessibilityLiveRegion="polite">
          {words}
        </Text>
        {footer}
      </View>
    );
  }

  const ringing = days.filter((one) => one.pieces.length > 0).length;
  const nowHour = hourIn(new Date(now), zone);
  const daysWords = ringing === 1 ? m.alert_week_days_one() : m.alert_week_days({ count: ringing });

  return (
    <View style={{ gap: space.xs }}>
      <Surface style={{ overflow: "hidden" }} insetEdge>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            pieces.length > 0 ? `${countWords(pieces.length)}, ${daysWords}` : countWords(0)
          }
          accessibilityHint={m.native_alert_week_open()}
          accessibilityState={{ expanded: isOpen }}
          accessibilityLiveRegion="polite"
          onPress={() => {
            animate();
            feel("select");
            setOpen((open) => !open);
          }}
          style={({ pressed }) => ({
            minHeight: TARGET,
            flexDirection: "row",
            alignItems: "center",
            gap: space.s,
            padding: space.s,
            backgroundColor: pressed ? colors["neutral-3"] : undefined,
          })}
        >
          <View style={{ flex: 1 }}>
            <Text weight="medium">{countWords(pieces.length)}</Text>
            {pieces.length > 0 ? (
              <Text size="xs" tone="muted">
                {daysWords}
              </Text>
            ) : null}
          </View>
          <DayDots days={days.map((one) => one.pieces.length > 0)} />
          <View style={{ transform: [{ rotate: isOpen ? "180deg" : "0deg" }] }}>
            <Glyph icon={ChevronDownIcon} size={16} color={colors["neutral-7"]} />
          </View>
        </Pressable>

        {isOpen ? (
          <View style={{ paddingHorizontal: space.s, paddingBottom: space.s, gap: space.xxs }}>
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
                    onPress={() => {
                      animate();
                      feel("select");
                      setDay(isDay ? null : one.key);
                    }}
                    style={{
                      minHeight: TARGET,
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
                      style={{ width: 64 }}
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
                      style={{ width: 40, textAlign: "right" }}
                    >
                      {has ? m.alert_hours({ count: hours }) : "—"}
                    </Text>
                  </Pressable>
                  {isDay ? (
                    <View
                      style={{
                        marginLeft: 64 + space.xs,
                        gap: space.xxs,
                        padding: space.xs,
                        borderRadius: 10,
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
                            <Text key={figure} size="xs" tone="muted">
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
            <Text size="xs" tone="muted">
              {m.alert_week_hint()}
            </Text>
          </View>
        ) : null}
      </Surface>
      {footer}
    </View>
  );
}
