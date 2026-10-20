import { PinIcon } from "@repo/ui/icon";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { Glyph } from "@/components/shared/glyph";
import { useTheme } from "@/lib/theme";

// The marker of a spot being added, which stands in the middle of the map while the map moves
// under it, as a phone's maps put a pin: its tip is the point, over a shadow on the ground. It
// rises while the map moves, and comes down where it rests. It is drawn in the accent, as the
// account's own spots are on the map. A reader who asked for no motion sees it still.

const HEAD = 34;
const STEM = 14;
const LIFT = 10;

export function SpotPin({ lifted }: { lifted: boolean }) {
  const { colors, motion } = useTheme();
  const reduceMotion = useReducedMotion();
  const up = useSharedValue(0);
  useEffect(() => {
    const to = lifted ? 1 : 0;
    up.value = reduceMotion
      ? to
      : withTiming(to, {
          duration: motion.duration,
          easing: Easing.bezier(...motion.easing),
        });
  }, [lifted, reduceMotion, up, motion]);

  const pin = useAnimatedStyle(() => ({ transform: [{ translateY: -LIFT * up.value }] }));
  const shadow = useAnimatedStyle(() => ({
    opacity: 0.35 - 0.15 * up.value,
    transform: [{ scale: 1 + 0.4 * up.value }],
  }));

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}
    >
      <Animated.View
        style={[
          {
            position: "absolute",
            width: 12,
            height: 5,
            borderRadius: 6,
            backgroundColor: "#000000",
          },
          shadow,
        ]}
      />
      {/* Its foot on the middle of the map: the tip of the stem is the point. */}
      <Animated.View style={[{ position: "absolute", bottom: "50%", alignItems: "center" }, pin]}>
        <View
          style={{
            width: HEAD,
            height: HEAD,
            borderRadius: HEAD / 2,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors["color-1"],
            borderWidth: 2,
            borderColor: colors["neutral-1"],
            boxShadow: "0 2px 6px rgba(0, 0, 0, 0.25)",
          }}
        >
          <Glyph icon={PinIcon} size={18} color={colors["neutral-1"]} />
        </View>
        <View
          style={{
            width: 2,
            height: STEM,
            borderBottomLeftRadius: 1,
            borderBottomRightRadius: 1,
            backgroundColor: colors["color-1"],
          }}
        />
      </Animated.View>
    </View>
  );
}
