import type { Verdict } from "@repo/conditions/sea-now";
import { type ShoreWind } from "@repo/conditions/shore-wind";
import { Fragment, type ReactNode } from "react";
import { type TextStyle, View } from "react-native";

import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { compassName, formatClock, formatSeconds } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { formatHeight, formatWind, useUnits } from "@/lib/units";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";

import { InlineArrow } from "./bearing";
import type { SeaNowFacts } from "./now";

// The sea now in one sentence, in the sheet of a break, a spot or a buoy: what the tiles read,
// written as the page of a break writes it (decision 059) and as the editor of an alert writes
// its own, then what fits the place's own words and what does not, each part on a green ground
// where it fits and a light red one where it does not. Decision 061. The web's `sea-now.tsx`.

/** How a wind meets a shore, in words: for the panel of a break, and for its days ahead. */
export const SHORE_WIND_NAMES: Record<ShoreWind, () => string> = {
  offshore: m.wind_offshore,
  cross_offshore: m.wind_cross_offshore,
  cross_shore: m.wind_cross_shore,
  cross_onshore: m.wind_cross_onshore,
  onshore: m.wind_onshore,
};

type Judged = Verdict["fits"][number];
type Judgement = "fits" | "off" | undefined;

const PART_NAMES: Record<Judged, () => string> = {
  swell: m.page_now_part_swell,
  size: m.page_now_part_size,
  wind: m.page_now_part_wind,
  tide: m.page_now_part_tide,
};

/** The names of things, as a list is said in the reader's language. */
export function listOf(things: Judged[]) {
  return new Intl.ListFormat(getLocale(), { type: "conjunction" }).format(
    things.map((thing) => PART_NAMES[thing]()),
  );
}

/**
 * A part of the sentence that its writer sets, in the darker type: underlined, or on the ground
 * its judgement gives it, with a thin space each side so that the ground is not cut at the
 * letters.
 */
function Part({ children, judged }: { children: ReactNode; judged?: Judgement }) {
  const { colors } = useTheme();
  const look: TextStyle =
    judged === "fits"
      ? { backgroundColor: colors["success-transparent"] }
      : judged === "off"
        ? { backgroundColor: colors["error-transparent"] }
        : {
            textDecorationLine: "underline",
            textDecorationStyle: "dotted",
            textDecorationColor: colors["neutral-5"],
          };
  return (
    <Text weight="medium" style={[{ color: colors["neutral-10"] }, look]}>
      {judged ? "\u2009" : ""}
      {children}
      {judged ? "\u2009" : ""}
    </Text>
  );
}

export function SeaNow({ facts, isLoading }: { facts: SeaNowFacts; isLoading: boolean }) {
  useUnits();
  const { colors, space, radius } = useTheme();
  const { waves, wind, tide, verdict } = facts;

  const judgementOf = (thing: Judged): Judgement =>
    !verdict
      ? undefined
      : verdict.fits.includes(thing)
        ? "fits"
        : verdict.off.includes(thing)
          ? "off"
          : undefined;
  const direction = (degrees: number) => (
    <>
      {m.alert_from()} <InlineArrow fromDegrees={degrees} color={colors["neutral-10"]} />{" "}
      {compassName(degrees)}
    </>
  );

  const waveParts: ReactNode[] = [];
  if (waves.height !== undefined) {
    waveParts.push(<Part judged={judgementOf("size")}>{formatHeight(waves.height)}</Part>);
  }
  if (waves.period !== undefined) {
    waveParts.push(<Part>{m.alert_period_of({ range: formatSeconds(waves.period) })}</Part>);
  }
  if (waves.direction !== undefined) {
    waveParts.push(<Part judged={judgementOf("swell")}>{direction(waves.direction)}</Part>);
  }
  const windParts: ReactNode[] = [];
  if (wind.knots !== undefined) windParts.push(<Part>{formatWind(wind.knots)}</Part>);
  if (wind.direction !== undefined) {
    // Judged by its name where the place knows no shore: the shore's word takes it otherwise.
    windParts.push(
      <Part judged={wind.atShore ? undefined : judgementOf("wind")}>
        {direction(wind.direction)}
      </Part>,
    );
  }
  if (wind.atShore) {
    windParts.push(<Part judged={judgementOf("wind")}>{SHORE_WIND_NAMES[wind.atShore]()}</Part>);
  }
  const [first, ...waveRest] = waveParts;
  const [windFirst, ...windRest] = windParts;
  const after = (parts: ReactNode[]) =>
    parts.map((part, index) => (
      // The parts keep their order: nothing else tells them apart.
      // oxlint-disable-next-line react/no-array-index-key
      <Fragment key={index}>, {part}</Fragment>
    ));
  const isJudged = verdict && (verdict.fits.length > 0 || verdict.off.length > 0);

  return (
    <View
      style={{
        gap: space.xs,
        padding: space.s,
        borderRadius: radius.xs,
        borderCurve: "continuous",
        backgroundColor: colors["neutral-2"],
      }}
    >
      <Text size="xs" tone="muted" accessibilityRole="header">
        {m.page_now_title()}
      </Text>
      {isLoading ? (
        <View style={{ gap: space.xs }}>
          <SkeletonText lines={2} />
        </View>
      ) : first === undefined && windFirst === undefined ? (
        <Text size="s" tone="muted">
          {m.forecast_none()}
        </Text>
      ) : (
        <Text tone="muted">
          {first !== undefined && (
            <>
              {m.page_now_says_waves()} {first}
              {after(waveRest)}
            </>
          )}
          {windFirst !== undefined && (
            <>
              {first !== undefined && ", "}
              {m.page_now_says_wind()} {windFirst}
              {after(windRest)}
            </>
          )}
          {tide && (
            <>
              , {m.page_now_says_tide()}{" "}
              <Part judged={judgementOf("tide")}>
                <InlineArrow
                  fromDegrees={tide.trend === "rising" ? 180 : 0}
                  color={colors["neutral-10"]}
                />{" "}
                {tide.trend === "rising" ? m.alert_trend_rising() : m.alert_trend_falling()}
              </Part>
              {tide.next && (
                <>
                  ,{" "}
                  <Part>
                    {tide.next.type === "high"
                      ? m.page_now_high_at({ time: formatClock(tide.next.time) })
                      : m.page_now_low_at({ time: formatClock(tide.next.time) })}
                  </Part>
                </>
              )}
            </>
          )}
          .
        </Text>
      )}
      {!isLoading && isJudged && (
        <Text size="s" tone="muted">
          {verdict.fits.length > 0 && (
            <Text size="s" style={{ color: colors["neutral-10"] }}>
              {m.page_now_fits({ parts: listOf(verdict.fits) })}
            </Text>
          )}
          {verdict.fits.length > 0 && verdict.off.length > 0 && " "}
          {verdict.off.length > 0 && m.page_now_off({ parts: listOf(verdict.off) })}
        </Text>
      )}
    </View>
  );
}

/** The sentence's place while the sea is not known yet. */
export function SeaNowSkeleton() {
  const { colors, space, radius } = useTheme();
  return (
    <View
      style={{
        gap: space.xs,
        padding: space.s,
        borderRadius: radius.xs,
        backgroundColor: colors["neutral-2"],
      }}
    >
      <Skeleton height={11} width={72} />
      <SkeletonText lines={2} />
    </View>
  );
}
