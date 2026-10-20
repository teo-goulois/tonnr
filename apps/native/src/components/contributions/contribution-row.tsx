import type { Contribution } from "@repo/client/viewer/types";
import { ChevronRightIcon } from "@repo/ui/icon";
import { Pressable, View } from "react-native";

import { readContribution, STATES } from "@/components/guides/guide-words";
import { Tag } from "@/components/guides/tag";
import { Glyph } from "@/components/shared/glyph";
import { TARGET } from "@/components/ui/metrics";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

type Written = {
  break: { id: string; name: string } | null;
  line: string;
  value: string[] | string | null;
};

/**
 * One contribution to a guide: the break it is of, which opens its guide, the line, what it
 * says, and, to its author, what became of it. A break that left the catalogue opens nothing.
 */
export function ContributionRow({
  one,
  status,
  reason,
  onOpenBreak,
}: {
  one: Written;
  // What became of it, said to its author alone.
  status?: Contribution["status"];
  reason?: string | null;
  onOpenBreak: (breakId: string) => void;
}) {
  const { colors, space } = useTheme();
  const { label, value } = readContribution(one);
  const place = one.break;
  const state = status ? STATES[status] : undefined;
  const placeName = place?.name ?? m.contribution_break_gone();
  const refused = status === "refused" && reason ? m.contribution_reason({ reason }) : undefined;

  return (
    <Pressable
      disabled={!place}
      accessibilityRole={place ? "button" : undefined}
      accessibilityLabel={[placeName, label, value, state?.label(), refused]
        .filter(Boolean)
        .join(", ")}
      accessibilityHint={place ? m.native_contribution_open_hint() : undefined}
      onPress={() => place && onOpenBreak(place.id)}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: space.s,
        minHeight: TARGET,
        paddingHorizontal: space.m,
        paddingVertical: space.s,
        backgroundColor: pressed ? colors["neutral-3"] : undefined,
      })}
    >
      <View style={{ flex: 1, gap: space.xxs }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
          <Text
            weight="medium"
            tone={place ? "default" : "muted"}
            numberOfLines={1}
            style={{ flexShrink: 1 }}
          >
            {placeName}
          </Text>
          {state ? <Tag tone={state.tone}>{state.label()}</Tag> : null}
        </View>
        <Text size="s" tone="muted">
          {label}
        </Text>
        {value ? <Text size="s">{value}</Text> : null}
        {refused ? (
          <Text size="s" tone="muted">
            {refused}
          </Text>
        ) : null}
      </View>
      {place ? <Glyph icon={ChevronRightIcon} size={16} color={colors["neutral-6"]} /> : null}
    </Pressable>
  );
}
