import type { AlertCriteria } from "@repo/client/viewer/types";
import { Fragment, type ReactNode } from "react";
import { View } from "react-native";

import { Text } from "@/components/ui/text";
import { useTheme } from "@/lib/theme";
import { useUnits } from "@/lib/units";
import { m } from "@/paraglide/messages";

import { said, type Value, valuesOf } from "./condition-words";
import { Bearing } from "./session-sea";

// Conditions in a few words, as an alert says its own: the waves, the swell, the wind and the
// tide, each with what is asked of it, what nothing is asked of left out. What an account likes at
// a place is said so, so that an alert is begun from it. The words are packages/client's, which
// the web's `ConditionsSummary` reads too. Decision 043.

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
