import type { AlertCriteria } from "@repo/client/viewer/types";
import type { ReactNode } from "react";
import { View } from "react-native";

import { Bearing } from "@/components/forecast/bearing";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/lib/theme";
import { useUnits } from "@/lib/units";
import { m } from "@/paraglide/messages";

import { said, type Value, valuesOf } from "./condition-words";

// Conditions in a few words, as an alert says its own: the waves, the swell, the wind and the
// tide, each with what is asked of it, what nothing is asked of left out. What an account likes at
// a place is said so, so that an alert is begun from it. The words are packages/client's, which
// the web's `ConditionsSummary` reads too. Decision 043.

// About the width of a space in the small type: what stands between two words of the line.
const SPACE = 3;

/** One value, with what follows it close, a comma: its words, or the two ends of its sector. */
function ValueWords({ value, after }: { value: Value; after: string }) {
  const { colors } = useTheme();
  if ("text" in value) {
    return (
      <Text size="s" numeric>
        {value.text + after}
      </Text>
    );
  }
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <Bearing degrees={value.arc.from} color={colors["neutral-10"]} />
      <Text size="s">–</Text>
      <Bearing degrees={value.arc.to} color={colors["neutral-10"]} />
      {after ? <Text size="s">{after}</Text> : null}
    </View>
  );
}

/**
 * Conditions in a line, as the web writes them: each part after its name, the values of a part
 * joined by "or" and its parts by commas, the parts a point apart, all in the ink of the values.
 * The line runs on to the next where a word ends; a screen reader hears it at once.
 */
export function ConditionsSummary({ criteria }: { criteria: AlertCriteria }) {
  useUnits();
  const groups = valuesOf(criteria);
  const or = m.alert_or_word();

  // The words of the line, each kept whole, in their order.
  const words: ReactNode[] = [];
  groups.forEach(([name, parts], at) => {
    words.push(
      <Text key={`${at}`} size="s">
        {name}
      </Text>,
    );
    parts.forEach((values, part) => {
      values.forEach((value, index) => {
        if (index > 0) {
          words.push(
            <Text key={`${at}-${part}-${index}-or`} size="s">
              {or}
            </Text>,
          );
        }
        // The last value of a part that another part follows takes the comma.
        const beforeNext = index === values.length - 1 && part < parts.length - 1;
        words.push(
          <ValueWords key={`${at}-${part}-${index}`} value={value} after={beforeNext ? "," : ""} />,
        );
      });
    });
    if (at < groups.length - 1) {
      words.push(
        <Text key={`${at}-dot`} size="s">
          ·
        </Text>,
      );
    }
  });

  return (
    <View
      accessible
      accessibilityLabel={groups
        .map(
          ([name, parts]) =>
            `${name}: ${parts.map((values) => values.map(said).join(` ${or} `)).join(", ")}`,
        )
        .join(". ")}
      style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: SPACE }}
    >
      {words}
    </View>
  );
}
