import { useMemo } from "react";
import { type StyleProp, View, type ViewProps, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  LayoutAnimationConfig,
  LinearTransition,
  useReducedMotion,
} from "react-native-reanimated";

import { useTheme } from "@/lib/theme";

import { morphWords } from "./morph-glyphs";
import { Text, type TextStep, type TextTone, type TextWeight } from "./text";

// A short text that moves to what it becomes, as the web's `MorphText` (Torph) draws one: the
// characters that stay slide to where they now stand, those that go fade where they stood, and
// those that come fade in, on the theme's large motion. For a value its reader changes by hand,
// such as the value of an alert's part over its slider or its compass. What each character is
// known by is `morph-glyphs.ts`'s. It stays still as it first shows, and for a reader who asked
// for no motion. A screen reader reads it whole, as one text.

type MorphTextProps = Omit<ViewProps, "children" | "style"> & {
  children: string;
  size?: TextStep;
  weight?: TextWeight;
  tone?: TextTone;
  /** Figures of one width, so that a number that changes keeps its place. */
  numeric?: boolean;
  /** A color of its own, which wins over `tone`. */
  color?: string;
  /** Where its lines stand: at the start, or in the middle, as a sheet's head centres its value. */
  align?: "start" | "center";
  style?: StyleProp<ViewStyle>;
};

export function MorphText({
  children,
  size = "m",
  weight = "regular",
  tone = "default",
  numeric = false,
  color,
  align = "start",
  style,
  ...view
}: MorphTextProps) {
  const { motion } = useTheme();
  const still = useReducedMotion();
  const words = useMemo(() => morphWords(children), [children]);
  const [x1, y1, x2, y2] = motion.largeEasing;
  const easing = Easing.bezier(x1, y1, x2, y2);
  const moves = still ? undefined : LinearTransition.duration(motion.largeDuration).easing(easing);
  const comes = still ? undefined : FadeIn.duration(motion.largeDuration).easing(easing);
  const goes = still ? undefined : FadeOut.duration(motion.largeDuration / 2).easing(easing);

  return (
    <LayoutAnimationConfig skipEntering skipExiting>
      <View
        accessible
        accessibilityRole="text"
        accessibilityLabel={children}
        {...view}
        style={[
          {
            flexDirection: "row",
            flexWrap: "wrap",
            justifyContent: align === "center" ? "center" : "flex-start",
          },
          style,
        ]}
      >
        {words.map((word) => (
          <Animated.View key={word.key} layout={moves} style={{ flexDirection: "row" }}>
            {word.glyphs.map((glyph) => (
              <Animated.View key={glyph.key} layout={moves} entering={comes} exiting={goes}>
                <Text
                  size={size}
                  weight={weight}
                  tone={tone}
                  numeric={numeric}
                  style={color ? { color } : undefined}
                >
                  {glyph.char}
                </Text>
              </Animated.View>
            ))}
          </Animated.View>
        ))}
      </View>
    </LayoutAnimationConfig>
  );
}
