import type { Alert, AlertCriteria } from "@repo/client/viewer/types";

import { compassName } from "@/lib/format";
import { m } from "@/paraglide/messages";

import {
  type Arc,
  type Part,
  type RangeKey,
  asksOfTide,
  bearingWords,
  isSetRange,
  rangeWords,
  tideOf,
  tideWords,
} from "./words";

// What an alert asks, in a line, as the web's `ConditionsSummary` writes it: the waves, the swell
// alone, the wind and the tide, each with what is asked of it, and what nothing is asked of left
// out. A screen reader is given the same line with the directions named in full.

type Said = { shown: string; spoken: string };

/** The conditions in a line, and the same for a screen reader. `after` is said last. */
export function conditionsLine(criteria: AlertCriteria, after?: string): Said {
  const either = (said: Said[]): Said[] =>
    said.length <= 1
      ? said
      : [
          {
            shown: said.map((one) => one.shown).join(` ${m.alert_or_word()} `),
            spoken: said.map((one) => one.spoken).join(` ${m.alert_or_word()} `),
          },
        ];
  const range = (key: RangeKey & Part) =>
    either(
      [criteria[key], ...(criteria.or?.[key] ?? [])].flatMap((value) => {
        if (!isSetRange(value)) return [];
        const words = rangeWords(key, value);
        return [{ shown: words, spoken: words }];
      }),
    );
  const sector = (
    key: "waveDirectionDegrees" | "primarySwellDirectionDegrees" | "windDirectionDegrees",
  ) =>
    either(
      [criteria[key], ...(criteria.or?.[key] ?? [])].flatMap((arc: Arc | undefined) =>
        arc
          ? [
              {
                shown: `${bearingWords(arc.from)}–${bearingWords(arc.to)}`,
                spoken: `${compassName(arc.from)} – ${compassName(arc.to)}`,
              },
            ]
          : [],
      ),
    );
  const tide = either(
    [tideOf(criteria), ...(criteria.or?.tide ?? [])].filter(asksOfTide).map((ask) => {
      const words = tideWords(ask);
      return { shown: words, spoken: words };
    }),
  );
  const groups: [string, Said[]][] = [
    [
      m.alert_summary_waves(),
      [
        ...range("waveHeightMeters"),
        ...range("wavePeakPeriodSeconds"),
        ...sector("waveDirectionDegrees"),
      ],
    ],
    [
      m.alert_summary_swell(),
      [...range("primarySwellHeightMeters"), ...sector("primarySwellDirectionDegrees")],
    ],
    [
      m.alert_summary_wind(),
      [...range("windSpeedMetersPerSecond"), ...sector("windDirectionDegrees")],
    ],
    [m.alert_summary_tide(), tide],
  ];
  const said = groups.filter(([, parts]) => parts.length > 0);
  const write = (pick: (one: Said) => string, between: string) =>
    [
      ...said.map(([name, parts]) => `${name} ${parts.map(pick).join(", ")}`),
      ...(after === undefined ? [] : [after]),
    ].join(between);
  return { shown: write((one) => one.shown, " · "), spoken: write((one) => one.spoken, ". ") };
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
