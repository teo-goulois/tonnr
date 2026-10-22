import type { Verdict } from "@repo/conditions/sea-now";
import { Fragment, type ReactNode } from "react";
import { Platform, type TextStyle, View, useWindowDimensions } from "react-native";

import { shoreWord } from "@/components/saved/sea-figures";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { compassName, formatClock, formatSeconds } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { formatHeight, formatWind, useUnits } from "@/lib/units";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";

import { DirectionArrow } from "./bearing";
import type { SeaNowFacts } from "./now";

// The sea now in one sentence, in the sheet of a break, a spot or a buoy: what the tiles read,
// written as the page of a break writes it (decision 059) and as the editor of an alert writes
// its own, then what fits the place's own words and what does not, each part on a green ground
// where it fits and a light red one where it does not. Decision 061. The web's `sea-now.tsx`.

type Judged = Verdict["fits"][number];
type Judgement = "fits" | "off" | undefined;

const NO_BREAK = "\u00a0";
// Words held on one line: their spaces do not break, nor do their hyphens, after which a word
// joiner stands, which draws nothing ("ouest-nord-ouest", "de secteur", "a encher").
const held = (words: string) => words.replaceAll(" ", NO_BREAK).replaceAll("-", "-\u2060");

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

// Geist's letters reach 1.005 em over their line and 0.295 em under it: the web's ground of a
// judged part covers the 1.3 em between. iOS sets a pill in a line with its words a little over
// the line's own: it is lowered by what was measured on the simulator, so that both read on one
// line.
const GROUND_EM = 1.3;
const SINK_EM = 0.08;

/**
 * A part of the sentence that its writer sets, in the darker type: underlined, or on the ground
 * its judgement gives it. On iOS the ground is a pill in the line, round at its ends as the web's
 * is, whole on one line and around the arrow too, which a text's own ground leaves out, and
 * standing on the line's baseline. Android, which is not tried here, keeps the text's ground,
 * with a thin space each side so that it is not cut at the letters, and draws an underline solid
 * and in the letters' ink, which would weigh more than the web's faint dotted one: there the
 * darker type alone sets the part apart.
 */
function Part({ children, judged }: { children: ReactNode; judged?: Judgement }) {
  const { colors, type } = useTheme();
  const { fontScale } = useWindowDimensions();
  const ground =
    judged === "fits"
      ? colors["success-transparent"]
      : judged === "off"
        ? colors["error-transparent"]
        : undefined;
  if (ground && Platform.OS === "ios") {
    const em = type.m.size * fontScale;
    return (
      <View
        style={{
          transform: [{ translateY: SINK_EM * em }],
          paddingHorizontal: 0.3 * em,
          borderRadius: 0.35 * em,
          borderCurve: "continuous",
          backgroundColor: ground,
        }}
      >
        <Text
          weight="medium"
          style={{ color: colors["neutral-10"], lineHeight: GROUND_EM * type.m.size }}
        >
          {children}
        </Text>
      </View>
    );
  }
  const look: TextStyle | undefined =
    judged === "fits"
      ? { backgroundColor: colors["success-transparent"] }
      : judged === "off"
        ? { backgroundColor: colors["error-transparent"] }
        : Platform.OS === "ios"
          ? {
              textDecorationLine: "underline",
              textDecorationStyle: "dotted",
              textDecorationColor: colors["neutral-5"],
            }
          : undefined;
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
  const { colors, space, radius, type } = useTheme();
  const { waves, wind, tide, verdict } = facts;

  const judgementOf = (thing: Judged): Judgement =>
    !verdict
      ? undefined
      : verdict.fits.includes(thing)
        ? "fits"
        : verdict.off.includes(thing)
          ? "off"
          : undefined;
  // A direction is never cut at the end of a line: no-break spaces hold its word, its arrow and
  // its name together, and its name's hyphens hold too, as the web's `whitespace-nowrap` does.
  const direction = (degrees: number) => (
    <>
      {held(m.alert_from())}
      {NO_BREAK}
      <DirectionArrow fromDegrees={degrees} size={13} color={colors["neutral-10"]} />
      {NO_BREAK}
      {held(compassName(degrees))}
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
    windParts.push(<Part judged={judgementOf("wind")}>{shoreWord(wind.atShore)}</Part>);
  }
  const [first, ...waveRest] = waveParts;
  const [windFirst, ...windRest] = windParts;

  // What a screen reader hears of the sentence, read whole: a part drawn as a pill in the line is
  // not read with the words around it.
  const spokenDirection = (degrees: number) => `${m.alert_from()} ${compassName(degrees)}`;
  const waveWords = [
    waves.height !== undefined ? formatHeight(waves.height) : undefined,
    waves.period !== undefined
      ? m.alert_period_of({ range: formatSeconds(waves.period) })
      : undefined,
    waves.direction !== undefined ? spokenDirection(waves.direction) : undefined,
  ].filter((words) => words !== undefined);
  const windWords = [
    wind.knots !== undefined ? formatWind(wind.knots) : undefined,
    wind.direction !== undefined ? spokenDirection(wind.direction) : undefined,
    wind.atShore ? shoreWord(wind.atShore) : undefined,
  ].filter((words) => words !== undefined);
  const spoken = [
    waveWords.length > 0 ? `${m.page_now_says_waves()} ${waveWords.join(", ")}` : undefined,
    windWords.length > 0 ? `${m.page_now_says_wind()} ${windWords.join(", ")}` : undefined,
    tide
      ? [
          `${m.page_now_says_tide()} ${tide.trend === "rising" ? m.alert_trend_rising() : m.alert_trend_falling()}`,
          tide.next &&
            (tide.next.type === "high"
              ? m.page_now_high_at({ time: formatClock(tide.next.time) })
              : m.page_now_low_at({ time: formatClock(tide.next.time) })),
        ]
          .filter(Boolean)
          .join(", ")
      : undefined,
  ]
    .filter((words) => words !== undefined)
    .join(", ");
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
        // As tall as the two lines of the sentence that takes its place.
        <View style={{ gap: space.xs }}>
          <Skeleton height={type.m.line} />
          <Skeleton height={type.m.line} width="66%" />
        </View>
      ) : first === undefined && windFirst === undefined ? (
        <Text size="s" tone="muted">
          {m.forecast_none()}
        </Text>
      ) : (
        <Text tone="muted" accessibilityLabel={`${spoken}.`}>
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
                <DirectionArrow
                  fromDegrees={tide.trend === "rising" ? 180 : 0}
                  size={13}
                  color={colors["neutral-10"]}
                />
                {NO_BREAK}
                {held(tide.trend === "rising" ? m.alert_trend_rising() : m.alert_trend_falling())}
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
