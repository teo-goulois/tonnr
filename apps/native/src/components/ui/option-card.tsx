import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

import { useTheme } from "@/lib/theme";

import { edge } from "./edge";
import { feel } from "./haptics";
import { TARGET } from "./metrics";
import { Text } from "./text";

// One choice among a few, as the web's profile questions draw it (`Choices` in
// `profile-questions.tsx`): a card of its own with the theme's fourth grey around it, its name
// over what it means. The one chosen stands on the theme's third grey with a line of its ink
// around it, and nothing else marks it: no check. Each press is passed on, the one on the choice
// in force too, since a question that goes on as it is answered goes on from it. A press gives way
// by the theme's distance, as the web's does.

/** How far a press moves a choice: the theme's `--motion-press-distance`. */
export const PRESS_DISTANCE = 1;

type OptionCardProps = {
  title: string;
  /** What it means, under its name. */
  description?: string | undefined;
  selected: boolean;
  onPress: () => void;
};

export function OptionCard({ title, description, selected, onPress }: OptionCardProps) {
  const { colors, space, radius, border } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={description ? `${title}, ${description}` : title}
      accessibilityState={{ selected }}
      onPress={() => {
        if (!selected) feel("select");
        onPress();
      }}
      style={({ pressed }) => [
        {
          minHeight: TARGET,
          gap: space.xxs,
          paddingHorizontal: space.s,
          paddingVertical: space.xs,
          borderRadius: radius.xs,
          borderCurve: "continuous",
          backgroundColor: selected
            ? colors["neutral-3"]
            : pressed
              ? colors["neutral-3-transparent"]
              : undefined,
          transform: [{ translateY: pressed ? PRESS_DISTANCE : 0 }],
        },
        edge(selected ? colors["neutral-10"] : colors["neutral-4"], {
          width: selected ? border.m : border.s,
        }),
      ]}
    >
      <Text weight="medium">{title}</Text>
      {description ? (
        <Text size="s" tone="muted">
          {description}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** Choices of one question, one under the other. */
export function OptionCards({ label, children }: { label: string; children: ReactNode }) {
  const { space } = useTheme();
  return (
    <View role="group" accessibilityLabel={label} style={{ gap: space.xs }}>
      {children}
    </View>
  );
}
