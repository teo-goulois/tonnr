import { View } from "react-native";

import { Glyph, type GlyphIcon } from "@/components/shared/glyph";
import { useTheme } from "@/lib/theme";

import { Button } from "./button";
import { Text } from "./text";

// What a screen says when it has nothing to show: what would be there, and how to put it
// there, with the one action that does.

type EmptyStateProps = {
  icon?: GlyphIcon;
  title: string;
  description?: string;
  action?: { label: string; onPress: () => void };
};

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  const { colors, space } = useTheme();
  return (
    <View style={{ alignItems: "center", gap: space.s, padding: space.l }}>
      {icon ? <Glyph icon={icon} size={24} color={colors["neutral-6"]} /> : null}
      <View style={{ alignItems: "center", gap: space.xxs }}>
        <Text weight="medium" accessibilityRole="header" style={{ textAlign: "center" }}>
          {title}
        </Text>
        {description ? (
          <Text size="s" tone="muted" style={{ textAlign: "center" }}>
            {description}
          </Text>
        ) : null}
      </View>
      {action ? (
        <Button variant="secondary" onPress={action.onPress} style={{ alignSelf: "center" }}>
          {action.label}
        </Button>
      ) : null}
    </View>
  );
}
