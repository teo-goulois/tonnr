import type { Alert, AlertCriteria } from "@repo/client/viewer/types";

import { type Value, valuesOf } from "@/components/sessions/condition-words";
import { m } from "@/paraglide/messages";

import { sectorWords } from "./part-words";
import { asksOfTide, isSetRange, rangeWords, tideOf, tideWords } from "./words";

// What an alert asks, in a line, as the web's `ConditionsSummary` writes it: the waves, the swell
// alone, the wind and the tide, each with what is asked of it, and what nothing is asked of left
// out. The parts and their values are those the sessions' `ConditionsSummary` draws, from
// components/sessions/condition-words.ts, save the tide of an alert written before the cycle,
// which says its way with an arrow, as the web's `TideTrend` does. `AlertSummary`, in
// alert-summary.tsx, draws the line with the arrows of `Bearing`, and a screen reader is given
// the same line in words, with the directions named in full.

/** A value of the line: words, a sector, or the way the tide goes, after the height it asks. */
export type LineValue = Value | { trend: "rising" | "falling"; height?: string };

/** The groups of the line, each with its parts, and each part with its values, joined by "or". */
export function lineGroups(criteria: AlertCriteria): (readonly [string, LineValue[][]])[] {
  const tide: LineValue[] = [tideOf(criteria), ...(criteria.or?.tide ?? [])]
    .filter(asksOfTide)
    .map((ask) =>
      ask.tideTrend && !ask.tideCycle && !ask.tideCoefficients
        ? {
            trend: ask.tideTrend,
            ...(isSetRange(ask.tideHeightMeters) && {
              height: rangeWords("tideHeightMeters", ask.tideHeightMeters),
            }),
          }
        : { text: tideWords(ask) },
    );
  // The tide is the one group whose values the line draws its own way.
  return valuesOf(criteria).map(([name, parts]) =>
    name === m.alert_summary_tide() ? ([name, [tide]] as const) : ([name, parts] as const),
  );
}

/** The words a screen reader hears for a value: a direction by the full name of its point. */
function spokenOf(value: LineValue) {
  if ("text" in value) return value.text;
  if ("arc" in value) return sectorWords(value.arc).spoken;
  const trend = value.trend === "rising" ? m.alert_trend_rising() : m.alert_trend_falling();
  return value.height === undefined ? trend : `${value.height}, ${trend}`;
}

/** The line in words, for a screen reader. `after` is said last. */
export function spokenLine(criteria: AlertCriteria, after?: string) {
  const or = ` ${m.alert_or_word()} `;
  return [
    ...lineGroups(criteria).map(
      ([name, parts]) =>
        `${name} ${parts.map((values) => values.map(spokenOf).join(or)).join(", ")}`,
    ),
    ...(after === undefined ? [] : [after]),
  ].join(". ");
}

/** What an alert asks, in a line: its conditions, then the shortest window. */
export function alertLine(alert: Pick<Alert, "criteria" | "shortestMinutes">) {
  const after = m.alert_summary_shortest({
    hours: m.alert_hours({ count: alert.shortestMinutes / 60 }),
  });
  return {
    groups: lineGroups(alert.criteria),
    after,
    spoken: spokenLine(alert.criteria, after),
  };
}

/** The names of places in a few words: "Hossegor", "Hossegor and La Nord", "Hossegor and 3 more". */
export function placesWords(names: readonly string[]) {
  const [first, second] = names;
  if (first === undefined) return "";
  if (second === undefined) return first;
  if (names.length === 2) return m.native_alert_places_two({ one: first, other: second });
  return m.native_alert_places_many({ name: first, count: names.length - 1 });
}
