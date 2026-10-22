import { CheckIcon } from "@repo/ui/icon";
import { type ReactNode, useEffect } from "react";
import { Pressable, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { Glyph } from "@/components/shared/glyph";
import { useTheme } from "@/lib/theme";

import { edge } from "./edge";
import { feel } from "./haptics";
import { TARGET } from "./metrics";
import { Text } from "./text";

// A word to press in and out among others, as the web's outlined toggles draw it (`ToggleGroup
// variant="outline" size="sm"`): a pill with the theme's fine edge, as tall as a finger on a
// phone, which takes the theme's ink while it is pressed in, with a check before its word. The
// check comes in on the theme's motion, and at once for a reader who asked for no motion. One
// that cannot be pressed keeps saying whether it is in. Its word is the theme's small step, the
// web's `sm`, unless it is given the body's, as the web's toggles of a surfer's boards are.
const CHECK = 12;

type ToggleProps = {
  /** Its word, which is also what a screen reader says. */
  label: string;
  /** Whether it is pressed in. */
  pressed: boolean;
  /** Pressed, to go in or out: what holds it says what that changes. */
  onPress: () => void;
  /** The step of the theme's type its word takes: `s`, the web's `sm`, or `m`, the body's. */
  size?: "s" | "m";
  disabled?: boolean;
};

export function Toggle({ label, pressed, onPress, size = "s", disabled = false }: ToggleProps) {
  const { colors, space, motion } = useTheme();
  const shown = useSharedValue(pressed ? 1 : 0);

  useEffect(() => {
    shown.set(
      withTiming(pressed ? 1 : 0, {
        duration: motion.duration,
        easing: Easing.bezier(
          motion.easing[0],
          motion.easing[1],
          motion.easing[2],
          motion.easing[3],
        ),
      }),
    );
  }, [pressed, shown, motion]);

  // The web's slot of the check: no room while the toggle is out, which its own margin takes
  // back from the gap, and while it is in its width, two points nearer the edge.
  const gap = size === "m" ? space.xs : space.xxs;
  const scale = motion.popupScale;
  const slot = useAnimatedStyle(() => {
    const amount = shown.get();
    return {
      width: CHECK * amount,
      marginStart: -2 * amount,
      marginEnd: -gap * (1 - amount),
      opacity: amount,
      transform: [{ scale: scale + (1 - scale) * amount }],
    };
  });

  const ink = pressed ? colors["neutral-1"] : disabled ? colors["neutral-6"] : colors["neutral-10"];
  const line = pressed
    ? colors["color-1"]
    : disabled
      ? colors["neutral-4-transparent"]
      : colors["neutral-4"];

  return (
    <Pressable
      accessibilityRole="togglebutton"
      accessibilityLabel={label}
      accessibilityState={{ checked: pressed, disabled }}
      disabled={disabled}
      onPress={() => {
        feel("select");
        onPress();
      }}
      style={({ pressed: touched }) => [
        {
          minHeight: TARGET,
          minWidth: TARGET,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap,
          paddingHorizontal: space.s,
          borderRadius: 9999,
          backgroundColor: pressed
            ? colors["color-1"]
            : touched
              ? colors["neutral-3-transparent"]
              : "transparent",
        },
        edge(line, { inset: true }),
      ]}
    >
      <Animated.View style={[{ alignItems: "flex-start" }, slot]}>
        <Glyph icon={CheckIcon} size={CHECK} color={ink} />
      </Animated.View>
      <Text size={size} weight="medium" dense numberOfLines={1} style={{ color: ink }}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Toggles that say one thing together, side by side and on the next line when the row is full,
 * as the web's group lays them.
 */
export function ToggleGroup({ label, children }: { label: string; children: ReactNode }) {
  const { space } = useTheme();
  return (
    <View
      role="group"
      accessibilityLabel={label}
      style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}
    >
      {children}
    </View>
  );
}
