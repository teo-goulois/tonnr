import {
  type ScaleStop,
  WAVE_HEIGHT_SCALE,
  WIND_SPEED_SCALE,
  scaleInk,
} from "@repo/client/sea-scales";
import type { Forecast } from "@repo/client/viewer/types";
import { weekOf } from "@repo/conditions/forecasts/week";
import { type SeaWords, type Verdict, verdictOf } from "@repo/conditions/sea-now";
import { shoreWind } from "@repo/conditions/shore-wind";
import { type ReactNode, useMemo, useState } from "react";
import { type LayoutChangeEvent, View } from "react-native";

import { shoreWord } from "@/components/saved/sea-figures";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { compassName, formatDay, toKnots } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { formatHeight, formatWind, useUnits } from "@/lib/units";
import { m } from "@/paraglide/messages";

import { Bearing, DirectionArrow } from "./bearing";
import { colorAt } from "./metrics";
import { listOf } from "./sea-now";

// The days ahead in words, for the essentials of a panel: one line a day, the biggest wave on
// the color of its height and where it comes from, and the wind at noon named by how it meets the
// shore, without the period, so that a day is read at a glance. Where the place has words, the
// swell's direction and the wind are laid against them day by day, on a green ground where they
// fit and a light red one where they do not. Decision 061. The web's `days-ahead.tsx`.

const HOUR_MS = 60 * 60 * 1000;

/** A figure on the color its scale gives it, as the map colors the sea and the wind. */
function SeaChip({
  scale,
  value,
  children,
}: {
  scale: ScaleStop[];
  value: number;
  children: string;
}) {
  const { space, radius } = useTheme();
  return (
    <View
      style={{
        minHeight: 24,
        justifyContent: "center",
        paddingHorizontal: space.xs,
        borderRadius: radius.xs,
        borderCurve: "continuous",
        backgroundColor: colorAt(scale, value),
      }}
    >
      <Text size="s" weight="medium" numeric dense style={{ color: scaleInk(scale, value) }}>
        {children}
      </Text>
    </View>
  );
}

type Judgement = "fits" | "off" | undefined;

/** Whether a day's thing fits the place's words, does not, or was not judged. */
function judgementOf(verdict: Verdict | null, thing: Verdict["fits"][number]): Judgement {
  return verdict?.fits.includes(thing) ? "fits" : verdict?.off.includes(thing) ? "off" : undefined;
}

/**
 * What a day says of a thing, on the ground its judgement gives it. What nothing judged, at a
 * buoy or at a place with no words, is written in the muted ink, as the web's is.
 */
function Judged({ judgement, children }: { judgement: Judgement; children: ReactNode }) {
  const { colors, space, radius } = useTheme();
  const fits = judgement === "fits";
  const off = judgement === "off";
  return (
    <View
      style={{
        height: 24,
        flexDirection: "row",
        alignItems: "center",
        gap: space.xxs,
        paddingHorizontal: space.xs,
        borderRadius: radius.xs,
        borderCurve: "continuous",
        backgroundColor: fits
          ? colors["success-transparent"]
          : off
            ? colors["error-transparent"]
            : undefined,
      }}
    >
      {children}
    </View>
  );
}

// A day's label from its `YYYY-MM-DD` in the reader's zone: read at noon, so that the day is the
// one written.
function dayLabel(day: string) {
  return formatDay(new Date(`${day}T12:00:00`));
}

export function DaysAhead({
  hours,
  now,
  offshoreFrom,
  words,
  isLoading,
}: {
  hours: Forecast["hours"] | undefined;
  now: number;
  offshoreFrom?: number | null;
  // What the place says of itself, for each day to be judged by. None at a buoy.
  words?: SeaWords | null;
  isLoading: boolean;
}) {
  useUnits();
  const { colors, space, type } = useTheme();
  // The days' column is as wide as its widest name, as the web's table sizes it.
  const [dayWidth, setDayWidth] = useState(0);
  const measureDay = (event: LayoutChangeEvent) => {
    const width = Math.ceil(event.nativeEvent.layout.width);
    setDayWidth((widest) => Math.max(widest, width));
  };
  const hour = Math.floor(now / HOUR_MS);
  const days = useMemo(
    () =>
      hours ? weekOf(hours, Intl.DateTimeFormat().resolvedOptions().timeZone, new Date(now)) : [],
    // The days move with the hours, not with the minutes.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [hours, hour],
  );

  if (isLoading) return <Skeleton height={256} />;
  if (days.length === 0) return null;

  return (
    <View>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ flexDirection: "row", paddingBottom: space.xxs }}
      >
        <View style={{ minWidth: dayWidth + space.s }} />
        <Text size="xs" tone="muted" style={{ flex: 1, paddingRight: space.s }}>
          {m.details_waves()}
        </Text>
        <Text size="xs" tone="muted" style={{ flex: 1 }}>
          {m.details_wind()}
        </Text>
      </View>
      {days.map((day) => {
        const wind = day.wind && toKnots(day.wind.speedMetersPerSecond);
        const windFrom = day.wind?.directionDegrees ?? null;
        const atShore =
          windFrom !== null && offshoreFrom != null ? shoreWind(windFrom, offshoreFrom) : null;
        // The day laid against the place's words: the tide is not, since it turns twice a day.
        const verdict = words
          ? verdictOf(
              words,
              {
                waveHeightMeters: day.wave?.heightMeters ?? null,
                waveDirectionDegrees: day.wave?.directionDegrees ?? null,
                windDirectionDegrees: windFrom,
              },
              null,
            )
          : null;
        // What a screen reader hears of the day, in one line.
        const said = [
          dayLabel(day.day),
          day.wave &&
            `${m.details_waves()} ${formatHeight(day.wave.heightMeters)}${
              day.wave.directionDegrees !== null
                ? ` ${m.alert_from()} ${compassName(day.wave.directionDegrees)}`
                : ""
            }`,
          wind != null &&
            `${m.details_wind()} ${formatWind(wind)}${
              atShore
                ? `, ${shoreWord(atShore)}`
                : windFrom !== null
                  ? ` ${m.alert_from()} ${compassName(windFrom)}`
                  : ""
            }`,
          verdict?.fits.length ? m.page_now_fits({ parts: listOf(verdict.fits) }) : null,
          verdict?.off.length ? m.page_now_off({ parts: listOf(verdict.off) }) : null,
        ]
          .filter(Boolean)
          .join(". ");
        // A direction nothing judged is written in the muted ink.
        const inkOf = (judgement: Judgement) =>
          judgement ? colors["neutral-10"] : colors["neutral-7"];
        const swell = judgementOf(verdict, "swell");
        const windJudged = judgementOf(verdict, "wind");
        return (
          <View
            key={day.day}
            accessible
            accessibilityLabel={said}
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingVertical: space.xs,
              borderTopWidth: 0.5,
              borderTopColor: colors["neutral-3"],
            }}
          >
            <View
              style={{
                minWidth: dayWidth + space.s,
                paddingRight: space.s,
                alignItems: "flex-start",
              }}
            >
              <Text size="s" weight="medium" numberOfLines={1} onLayout={measureDay}>
                {dayLabel(day.day)}
              </Text>
            </View>
            <View
              style={{
                flex: 1,
                flexDirection: "row",
                flexWrap: "wrap",
                alignItems: "center",
                gap: space.xs,
                paddingRight: space.s,
              }}
            >
              {day.wave ? (
                <>
                  <SeaChip scale={WAVE_HEIGHT_SCALE} value={day.wave.heightMeters}>
                    {formatHeight(day.wave.heightMeters)}
                  </SeaChip>
                  {day.wave.directionDegrees !== null && (
                    <Judged judgement={swell}>
                      <Bearing degrees={day.wave.directionDegrees} color={inkOf(swell)} />
                    </Judged>
                  )}
                </>
              ) : (
                <Text size="s" tone="muted">
                  –
                </Text>
              )}
            </View>
            <View
              style={{
                flex: 1,
                flexDirection: "row",
                flexWrap: "wrap",
                alignItems: "center",
                gap: space.xs,
              }}
            >
              {wind != null ? (
                <>
                  <SeaChip scale={WIND_SPEED_SCALE} value={wind}>
                    {formatWind(wind)}
                  </SeaChip>
                  {/* Named by the shore where the place knows it, with the way it blows; by
                      its point alone otherwise. */}
                  {atShore && windFrom !== null ? (
                    <Judged judgement={windJudged}>
                      {/* The size of the word's letters, as the web's 0.85em. */}
                      <DirectionArrow
                        fromDegrees={windFrom}
                        size={Math.round(type.s.size * 0.85)}
                        color={inkOf(windJudged)}
                      />
                      <Text size="s" numberOfLines={1} style={{ color: inkOf(windJudged) }}>
                        {shoreWord(atShore)}
                      </Text>
                    </Judged>
                  ) : (
                    windFrom !== null && (
                      <Judged judgement={windJudged}>
                        <Bearing degrees={windFrom} color={inkOf(windJudged)} />
                      </Judged>
                    )
                  )}
                </>
              ) : (
                <Text size="s" tone="muted">
                  –
                </Text>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}
