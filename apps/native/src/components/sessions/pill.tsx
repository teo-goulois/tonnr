import type { ComponentRef, ReactNode, Ref } from "react";
import { Pressable, View } from "react-native";

import { TARGET } from "@/components/ui/metrics";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/lib/theme";

// A value on a pill, as the web's session form draws the answers of its lines: round, on the
// theme's third grey and its fourth while it is pressed, in the body's type, its words cut short
// where the line has no more room, in the theme's faint grey while nothing was said and its sixth
// while it cannot be changed. The day and the hour of a session, and how big its waves looked.

type PillProps = {
  ref?: Ref<ComponentRef<typeof View>>;
  shown: string;
  /** Nothing said yet: its words in the theme's faint grey. */
  faint?: boolean;
  disabled?: boolean;
  /** Figures of one width, as an hour. */
  numeric?: boolean;
  /** What a press does. Without it, what stands over the pill takes the press. */
  onPress?: () => void;
  accessibilityLabel: string;
  accessibilityHint?: string | undefined;
  /** What stands under the whole pill, out of sight: iOS's own picker, which a press opens. */
  children?: ReactNode;
};

export function Pill({
  ref,
  shown,
  faint = false,
  disabled = false,
  numeric = false,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  children,
}: PillProps) {
  const { colors, space, type } = useTheme();
  // The web's `py-xs` around the body's line: a finger is given the rest of its target around it.
  const slop = Math.max(0, Math.ceil((TARGET - type.m.line - 2 * space.xs) / 2));
  const look = (pressed: boolean) => ({
    flexShrink: 1,
    minWidth: 0,
    justifyContent: "center" as const,
    paddingHorizontal: space.s,
    paddingVertical: space.xs,
    borderRadius: 9999,
    backgroundColor: pressed && !disabled ? colors["neutral-4"] : colors["neutral-3"],
  });
  const words = (
    <Text
      numeric={numeric}
      numberOfLines={1}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        color: disabled ? colors["neutral-6"] : faint ? colors["neutral-7"] : colors["neutral-10"],
      }}
    >
      {shown}
    </Text>
  );

  if (!onPress) {
    // What it holds, iOS's picker, stands under its face, which lets every touch through to it: a
    // press lands on the picker, and a screen reader's lands in its middle, which is the picker
    // too. The face hides the picker whole, which no opacity of its own did, and the pill cuts it
    // at its edges, past which it is grown.
    const { paddingHorizontal, paddingVertical, ...shape } = look(false);
    return (
      <View
        ref={ref}
        accessible
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled }}
        hitSlop={{ top: slop, bottom: slop }}
        style={[shape, { overflow: "hidden" }]}
      >
        {children}
        <View
          pointerEvents="none"
          style={{
            paddingHorizontal,
            paddingVertical,
            justifyContent: "center",
            backgroundColor: shape.backgroundColor,
          }}
        >
          {words}
        </View>
      </View>
    );
  }
  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={{ top: slop, bottom: slop }}
      style={({ pressed }) => look(pressed)}
    >
      {words}
      {children}
    </Pressable>
  );
}
