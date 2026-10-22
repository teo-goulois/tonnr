import type { Freshness } from "@/lib/format";
import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { useTheme } from "@/lib/theme";

// How recent a reading is, as the web's `FreshnessDot` says it in a panel or a list: a dot of
// six points, green while the reading is fresh, amber while it ages, then grey. A fresh one beats
// as Tailwind's `animate-ping` does, a ring that grows to twice its size and fades, each second,
// and stays still for a reader who asked for no motion. What the dot says is said in words
// beside it, or in the row's name to a screen reader: the dot itself is hidden from one.

const DOT = 6;
const PING_MS = 1000;

export function FreshnessDot({ freshness }: { freshness: Freshness }) {
  const { colors } = useTheme();
  const color =
    freshness === "fresh"
      ? colors.success
      : freshness === "aging"
        ? colors.warning
        : colors["neutral-6"];
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: DOT, height: DOT }}
    >
      {freshness === "fresh" ? <Ping color={color} /> : null}
      <View style={{ width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: color }} />
    </View>
  );
}

/** The ring a fresh reading's dot beats with. */
function Ping({ color }: { color: string }) {
  const still = useReducedMotion();
  const beat = useSharedValue(0);
  useEffect(() => {
    if (still) return;
    // Tailwind's ping: out from the dot over three quarters of the beat, gone for the rest.
    beat.set(
      withRepeat(
        withTiming(1, { duration: PING_MS, easing: Easing.bezier(0, 0, 0.2, 1) }),
        -1,
        false,
      ),
    );
  }, [beat, still]);
  const ring = useAnimatedStyle(() => {
    const grown = Math.min(beat.get() / 0.75, 1);
    return { opacity: 1 - grown, transform: [{ scale: 1 + grown }] };
  });
  if (still) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          width: DOT,
          height: DOT,
          borderRadius: DOT / 2,
          backgroundColor: color,
        },
        ring,
      ]}
    />
  );
}
