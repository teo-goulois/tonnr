import { CheckIcon } from "@repo/ui/icon";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

import { Glyph } from "@/components/shared/glyph";
import { feel } from "@/components/ui/haptics";
import { Section } from "@/components/ui/list";
import { TARGET } from "@/components/ui/metrics";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/lib/theme";

// A choice among a few, as a phone's settings make one: a step of its own, whose rows each say a
// choice and, under it, what it means, the one in force checked at its end. A press chooses at
// once and is felt; there is nothing to save. The check says it to the eye and the row's state
// to a screen reader, so the color is never alone in saying it.

export type Choice<Value extends string> = {
  value: Value;
  title: string;
  description?: string | undefined;
  /** Something drawn under the title: an example of the choice. */
  preview?: ReactNode;
};

function ChoiceRow({
  title,
  description,
  preview,
  selected,
  onPress,
}: {
  title: string;
  description?: string | undefined;
  preview?: ReactNode;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors, space } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={description ? `${title}, ${description}` : title}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: TARGET,
        flexDirection: "row",
        alignItems: "center",
        gap: space.s,
        paddingHorizontal: space.m,
        paddingVertical: space.xs,
        backgroundColor: pressed ? colors["neutral-3"] : undefined,
      })}
    >
      <View style={{ flex: 1, gap: space.xxs }}>
        <Text weight={selected ? "medium" : "regular"}>{title}</Text>
        {description ? (
          <Text size="s" tone="muted">
            {description}
          </Text>
        ) : null}
        {preview}
      </View>
      <View style={{ width: 20, alignItems: "center" }}>
        {selected ? <Glyph icon={CheckIcon} size={18} color={colors["color-1"]} /> : null}
      </View>
    </Pressable>
  );
}

/** The choices, in a group, the one in force checked. */
export function ChoiceList<Value extends string>({
  title,
  footer,
  choices,
  value,
  onChoose,
}: {
  title?: string;
  footer?: string;
  choices: readonly Choice<Value>[];
  value: Value | null;
  onChoose: (value: Value) => void;
}) {
  return (
    <Section title={title} footer={footer}>
      {choices.map((choice) => (
        <ChoiceRow
          key={choice.value}
          title={choice.title}
          description={choice.description}
          preview={choice.preview}
          selected={choice.value === value}
          onPress={() => {
            if (choice.value === value) return;
            feel("select");
            onChoose(choice.value);
          }}
        />
      ))}
    </Section>
  );
}
