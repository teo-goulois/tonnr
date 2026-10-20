import {
  type Arc,
  alertWords,
  asksOfTide,
  isSetRange,
  type RangeKey,
  tideOf,
} from "@repo/client/alerts/alert-words";
import type { AlertCriteria } from "@repo/client/viewer/types";
import { Fragment, type ReactNode } from "react";
import { View } from "react-native";

import { Text } from "@/components/ui/text";
import { compassName, compassPoint, formatNumber } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import {
  getUnits,
  heightIn,
  heightUnit,
  knotsFrom,
  metersFrom,
  useUnits,
  windIn,
  windUnit,
} from "@/lib/units";
import { m } from "@/paraglide/messages";

import { Bearing } from "./session-sea";

// Conditions in a few words, as an alert says its own: the waves, the swell, the wind and the
// tide, each with what is asked of it, what nothing is asked of left out. What an account likes at
// a place is said so, so that an alert is begun from it. The words are packages/client's, which
// the web's `ConditionsSummary` reads too. Decision 043.

const words = alertWords({
  units: getUnits,
  writing: { heightIn, metersFrom, heightUnit, windIn, knotsFrom, windUnit },
  format: { formatNumber, compassPoint },
  m,
});

/** A value of a part: words, or a sector drawn with its two bearings. */
type Value = { text: string } | { arc: Arc };

const said = (value: Value) =>
  "text" in value ? value.text : `${compassName(value.arc.from)}–${compassName(value.arc.to)}`;

function valuesOf(criteria: AlertCriteria) {
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

/** One value: its words, or the two ends of its sector, clockwise. */
function ValueText({ value }: { value: Value }) {
  const { colors } = useTheme();
  if ("text" in value) {
    return (
      <Text size="s" numeric style={{ color: colors["neutral-10"] }}>
        {value.text}
      </Text>
    );
  }
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <Bearing degrees={value.arc.from} color={colors["neutral-10"]} />
      <Text size="s" style={{ color: colors["neutral-10"] }}>
        –
      </Text>
      <Bearing degrees={value.arc.to} color={colors["neutral-10"]} />
    </View>
  );
}

/** Items between which `between` is said, as a part of a line. */
function joined<Item>(items: readonly Item[], between: string, draw: (item: Item) => ReactNode) {
  return items.map((item, index) => (
    // The items keep their order: nothing else tells them apart.
    // oxlint-disable-next-line react/no-array-index-key
    <Fragment key={index}>
      {index > 0 ? (
        <Text size="s" tone="muted">
          {between}
        </Text>
      ) : null}
      {draw(item)}
    </Fragment>
  ));
}

/** Conditions in a few words: each part on its line, what it asks after its name. */
export function ConditionsSummary({ criteria }: { criteria: AlertCriteria }) {
  useUnits();
  const { space } = useTheme();
  const or = ` ${m.alert_or_word()} `;
  return (
    <View style={{ gap: space.xxs }}>
      {valuesOf(criteria).map(([name, parts]) => (
        <View
          key={name}
          accessible
          accessibilityLabel={`${name}: ${parts.map((values) => values.map(said).join(or)).join(", ")}`}
          style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 3 }}
        >
          <Text size="s" tone="muted">
            {name}
          </Text>
          {joined(parts, ", ", (values) => (
            <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center" }}>
              {joined(values, or, (value) => (
                <ValueText value={value} />
              ))}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}
