import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { edge } from "@/components/ui/edge";
import { useTheme } from "@/lib/theme";

// What the map draws over itself as views, as the web's `map-markers.tsx` draws them over its
// canvas.

// The web's dot: 14 pixels in the accent with the surface's edge, over a halo 6 pixels wider on
// each side that pings as Tailwind's `animate-ping` does, a second at a time.
const DOT = 14;
const HALO = DOT + 12;
const PING_MS = 1000;

/** Where the reader was found: a dot in the accent, whose halo pings unless motion was refused. */
export function UserDot({ label }: { label: string }) {
  const { colors, border } = useTheme();
  const reduceMotion = useReducedMotion();
  const ping = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) {
      ping.value = 0;
      return;
    }
    // Out to twice its size and gone by three quarters of the second, then still.
    ping.value = withRepeat(
      withSequence(
        withTiming(1, { duration: PING_MS * 0.75, easing: Easing.bezier(0, 0, 0.2, 1) }),
        withTiming(1, { duration: PING_MS * 0.25 }),
        withTiming(0, { duration: 0 }),
      ),
      -1,
    );
  }, [reduceMotion, ping]);
  const halo = useAnimatedStyle(() => ({
    opacity: 1 - ping.value,
    transform: [{ scale: 1 + ping.value }],
  }));

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      pointerEvents="none"
      style={{ width: HALO, height: HALO, alignItems: "center", justifyContent: "center" }}
    >
      <Animated.View
        style={[
          {
            position: "absolute",
            width: HALO,
            height: HALO,
            borderRadius: HALO / 2,
            backgroundColor: colors["color-1-transparent"],
          },
          halo,
        ]}
      />
      <View
        style={{
          width: DOT,
          height: DOT,
          borderRadius: DOT / 2,
          backgroundColor: colors["color-1"],
          ...edge(colors["neutral-1"], { width: border.l }),
        }}
      />
    </View>
  );
}
