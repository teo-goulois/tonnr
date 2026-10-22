import { View } from "react-native";

import { useTheme } from "@/lib/theme";

import { Text } from "./text";

/**
 * A short word on the theme's grey, the web's neutral `Badge`: 20 points high, with the theme's
 * smallest radius. `tone` is one of the theme's signals, on its transparent ground.
 */
export function Badge({
  children,
  tone = "neutral",
  accessibilityLabel,
}: {
  children: string;
  tone?: "neutral" | "success" | "warning" | "error";
  /** What a screen reader says in place of the word: a rank's name for its initials. */
  accessibilityLabel?: string;
}) {
  const { colors, space, radius } = useTheme();
  const ground = tone === "neutral" ? colors["neutral-3"] : colors[`${tone}-transparent` as const];
  return (
    <View
      accessible={accessibilityLabel !== undefined}
      accessibilityLabel={accessibilityLabel}
      style={{
        height: 20,
        justifyContent: "center",
        paddingHorizontal: space.xs,
        borderRadius: radius.xs,
        borderCurve: "continuous",
        backgroundColor: ground,
      }}
    >
      <Text size="xs" weight="medium" dense numberOfLines={1} numeric>
        {children}
      </Text>
    </View>
  );
}
