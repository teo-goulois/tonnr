import {
  type Arc,
  alertWords,
  asksOfTide,
  isSetRange,
  type RangeKey,
  tideOf,
} from "@repo/client/alerts/alert-words";
import type { AlertCriteria } from "@repo/client/viewer/types";

import { compassName, compassPoint, formatNumber } from "@/lib/format";
import {
  getUnits,
  heightIn,
  heightUnit,
  knotsFrom,
  metersFrom,
  windIn,
  windUnit,
} from "@/lib/units";
import { m } from "@/paraglide/messages";

// The conditions of an alert in parts and values, in the reader's language and units, as the
// web's `ConditionsSummary` says them: the words are packages/client's. A module that imports
// nothing of React Native, so that a test reads it. Decision 043.

const words = alertWords({
  units: getUnits,
  writing: { heightIn, metersFrom, heightUnit, windIn, knotsFrom, windUnit },
  format: { formatNumber, compassPoint },
  m,
});

/** A value of a part: words, or a sector drawn with its two bearings. */
export type Value = { text: string } | { arc: Arc };

export const said = (value: Value) =>
  "text" in value ? value.text : `${compassName(value.arc.from)}–${compassName(value.arc.to)}`;

export function valuesOf(criteria: AlertCriteria) {
  const range = (key: RangeKey & keyof NonNullable<AlertCriteria["or"]>): Value[] =>
    [criteria[key], ...(criteria.or?.[key] ?? [])].flatMap((value) =>
      isSetRange(value) ? [{ text: words.rangeWords(key, value) }] : [],
    );
  const sector = (
    key: "waveDirectionDegrees" | "primarySwellDirectionDegrees" | "windDirectionDegrees",
  ): Value[] =>
    [criteria[key], ...(criteria.or?.[key] ?? [])].flatMap((arc: Arc | undefined) =>
      arc ? [{ arc }] : [],
    );
  const tide: Value[] = [tideOf(criteria), ...(criteria.or?.tide ?? [])]
    .filter(asksOfTide)
    .map((ask) => ({ text: words.tideWords(ask) }));
  const groups: [string, Value[][]][] = [
    [
      m.alert_summary_waves(),
      [range("waveHeightMeters"), range("wavePeakPeriodSeconds"), sector("waveDirectionDegrees")],
    ],
    [
      m.alert_summary_swell(),
      [range("primarySwellHeightMeters"), sector("primarySwellDirectionDegrees")],
    ],
    [m.alert_summary_wind(), [range("windSpeedMetersPerSecond"), sector("windDirectionDegrees")]],
    [m.alert_summary_tide(), [tide]],
  ];
  // A group keeps the parts something is asked of, each with its values.
  return groups
    .map(([name, parts]) => [name, parts.filter((values) => values.length > 0)] as const)
    .filter(([, parts]) => parts.length > 0);
}
