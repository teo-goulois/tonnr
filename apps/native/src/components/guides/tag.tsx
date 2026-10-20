import { View } from "react-native";

import { Text } from "@/components/ui/text";
import { useTheme } from "@/lib/theme";

import type { ContributionTone } from "./guide-words";

// A short word that says where something stands, as the web's `Badge` does: the state of a
// contribution, a rank, a friend that was brought. Its words say it; the ground only adds to
// them, so that color is never alone in saying it.

export type TagTone = ContributionTone;

export function Tag({
  children,
  tone = "neutral",
  accessibilityLabel,
}: {
  children: string;
  tone?: TagTone;
  accessibilityLabel?: string;
}) {
  const { colors, space, radius } = useTheme();
  const ground =
    tone === "success"
      ? colors["success-transparent"]
      : tone === "warning"
        ? colors["warning-transparent"]
        : tone === "error"
          ? colors["error-transparent"]
          : colors["neutral-3"];
  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel ?? children}
      style={{
        alignSelf: "flex-start",
        paddingHorizontal: space.xs,
        paddingVertical: 2,
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
