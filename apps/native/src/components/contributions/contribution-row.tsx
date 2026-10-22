import type { Contribution } from "@repo/client/viewer/types";
import { View } from "react-native";

import { fieldOf } from "@/components/guides/characteristic-words";
import { WordsReading } from "@/components/guides/characteristics";
import { readContribution, STATES } from "@/components/guides/guide-words";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

/**
 * One contribution to a guide, as the web's `ContributionsPanel` lists it: the break it is of,
 * whose name opens its guide, and what became of it at the end of the line, then the line it
 * is of, what it says, its directions each with its arrow, and why it was refused. A break that
 * left the catalogue opens nothing.
 */
export function ContributionRow({
  one,
  onOpenBreak,
}: {
  one: Contribution;
  onOpenBreak: (breakId: string) => void;
}) {
  const { space } = useTheme();
  const { label, value } = readContribution(one);
  const field = fieldOf(one.line);
  const place = one.break;
  const state = STATES[one.status];

  return (
    <View style={{ gap: space.xxs }}>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          columnGap: space.s,
          rowGap: space.xxs,
        }}
      >
        {place ? (
          // The name is a quiet button whose words stand in line with the lines under it.
          <Button
            variant="ghost"
            accessibilityHint={m.native_contribution_open_hint()}
            onPress={() => onOpenBreak(place.id)}
            style={{ maxWidth: "100%", marginLeft: -space.xs, paddingHorizontal: space.xs }}
          >
            {place.name}
          </Button>
        ) : (
          <Text size="s" tone="muted">
            {m.contribution_break_gone()}
          </Text>
        )}
        <Badge tone={state.tone}>{state.label()}</Badge>
      </View>
      <Text size="s" tone="muted">
        {label}
      </Text>
      {field && Array.isArray(one.value) && one.value.length > 0 ? (
        <WordsReading field={field.key} given={one.value} />
      ) : value ? (
        <Text size="s">{value}</Text>
      ) : null}
      {one.status === "refused" && one.reason ? (
        <Text size="s" tone="muted">
          {m.contribution_reason({ reason: one.reason })}
        </Text>
      ) : null}
    </View>
  );
}
