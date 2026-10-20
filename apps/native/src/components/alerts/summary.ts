import type { Alert, AlertCriteria } from "@repo/client/viewer/types";

import { type Value, valuesOf } from "@/components/sessions/condition-words";
import { m } from "@/paraglide/messages";

import { sectorWords } from "./part-words";

// What an alert asks, in a line, as the web's `ConditionsSummary` writes it: the waves, the swell
// alone, the wind and the tide, each with what is asked of it, and what nothing is asked of left
// out. The parts and their values are those the sessions' `ConditionsSummary` draws, from
// components/sessions/condition-words.ts; here they are written in a line of text, a direction
// as an arrow and its point, and a screen reader is given the same line with the directions
// named in full.

type Said = { shown: string; spoken: string };

const shownOf = (value: Value) => ("text" in value ? value.text : sectorWords(value.arc).shown);
const spokenOf = (value: Value) => ("text" in value ? value.text : sectorWords(value.arc).spoken);

/** The conditions in a line, and the same for a screen reader. `after` is said last. */
export function conditionsLine(criteria: AlertCriteria, after?: string): Said {
  const or = ` ${m.alert_or_word()} `;
  const groups = valuesOf(criteria);
  const write = (pick: (value: Value) => string, between: string) =>
    [
      ...groups.map(
        ([name, parts]) => `${name} ${parts.map((values) => values.map(pick).join(or)).join(", ")}`,
      ),
      ...(after === undefined ? [] : [after]),
    ].join(between);
  return { shown: write(shownOf, " · "), spoken: write(spokenOf, ". ") };
}

/** What an alert asks, in a line: its conditions, then the shortest window. */
export function alertLine(alert: Pick<Alert, "criteria" | "shortestMinutes">) {
  return conditionsLine(
    alert.criteria,
    m.alert_summary_shortest({ hours: m.alert_hours({ count: alert.shortestMinutes / 60 }) }),
  );
}

/** The names of places in a few words: "Hossegor", "Hossegor and La Nord", "Hossegor and 3 more". */
export function placesWords(names: readonly string[]) {
  const [first, second] = names;
  if (first === undefined) return "";
  if (second === undefined) return first;
  if (names.length === 2) return m.native_alert_places_two({ one: first, other: second });
  return m.native_alert_places_many({ name: first, count: names.length - 1 });
}
