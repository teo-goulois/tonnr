import type { ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { Glyph, type GlyphIcon } from "@/components/shared/glyph";
import { useTheme } from "@/lib/theme";

import { edge } from "./edge";
import { feel } from "./haptics";
import { TARGET } from "./metrics";
import { Text } from "./text";

// A list's chip, as the web's `ListChips` draws it: a pill that shows one list alone, filled
// while it is the one in view. On the map it floats, on the theme's surface with its edge, as
// the map's buttons do (decision 040). Its heights are the web's.
const HEIGHT = 32;
const FLOATING_HEIGHT = 36;

type ChipProps = {
  label: string;
  /** Whether it is the one in view. */
  selected: boolean;
  onPress: () => void;
  /** An icon before the name, and what a screen reader says of it: a shared list's. */
  icon?: GlyphIcon;
  iconLabel?: string;
  /** Floats on the map, in place of standing in a panel. */
  floating?: boolean;
  disabled?: boolean;
};

export function Chip({
  label,
  selected,
  onPress,
  icon,
  iconLabel,
  floating = false,
  disabled = false,
}: ChipProps) {
  const { colors, space } = useTheme();
  const height = floating ? FLOATING_HEIGHT : HEIGHT;
  const slop = Math.ceil((TARGET - height) / 2);
  const rest = floating ? colors["neutral-1"] : colors["neutral-3-transparent"];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={iconLabel ? `${iconLabel}, ${label}` : label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      hitSlop={{ top: slop, bottom: slop }}
      onPress={() => {
        if (!selected) feel("select");
        onPress();
      }}
      style={({ pressed }) => [
        {
          height,
          flexDirection: "row",
          alignItems: "center",
          gap: space.xxs,
          paddingHorizontal: space.s,
          borderRadius: height / 2,
          backgroundColor: selected ? colors["neutral-10"] : rest,
          opacity: pressed && !selected ? 0.7 : 1,
        },
        floating && !selected ? edge(colors["neutral-10-transparent"], { inset: true }) : null,
      ]}
    >
      {({ pressed }) => {
        const color = selected
          ? colors["neutral-1"]
          : floating || pressed
            ? colors["neutral-10"]
            : disabled
              ? colors["neutral-6"]
              : colors["neutral-7"];
        return (
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.xxs }}>
            {icon ? <Glyph icon={icon} size={14} color={color} /> : null}
            <Text size="s" weight="medium" dense numberOfLines={1} style={{ color }}>
              {label}
            </Text>
          </View>
        );
      }}
    </Pressable>
  );
}

/**
 * A row of chips that scrolls when it is longer than its place, as the web's does. `bleed` is
 * the room of what holds it, which the row crosses to its edges, so that a chip cut by one says
 * that more follow. The row is a finger's height, so that a chip's target stays inside it.
 */
export function ChipRow({
  label,
  bleed = 0,
  children,
}: {
  label: string;
  bleed?: number;
  children: ReactNode;
}) {
  const { space } = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      role="group"
      accessibilityLabel={label}
      style={{ marginHorizontal: -bleed, flexGrow: 0 }}
      contentContainerStyle={{
        gap: space.xs,
        paddingHorizontal: bleed,
        minHeight: TARGET,
        alignItems: "center",
      }}
    >
      {children}
    </ScrollView>
  );
}
