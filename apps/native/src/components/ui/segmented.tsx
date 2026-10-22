import { useEffect, useState } from "react";
import { type LayoutRectangle, Pressable, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { useTheme } from "@/lib/theme";

import { edge } from "./edge";
import { feel } from "./haptics";
import { TARGET } from "./metrics";
import { Text } from "./text";

// A choice among a few, as the web's segments draw it (`TabsList variant="segment"`): a pill of
// the theme's muted ground, its options in the theme's faint grey, the web's tabs' own, on which
// the one chosen stands in the theme's ink on its surface with its edge, which
// moves to the next on the theme's motion, and stays still for a reader who asked for no motion.
// Under `lg` the web gives it a button's height, as decision 040 asks.
const SEGMENT_HEIGHT = 32;

export type SegmentedOption<Value extends string> = { value: Value; label: string };

type SegmentedProps<Value extends string> = {
  /** What is chosen, which a screen reader says before the options. */
  label: string;
  options: readonly SegmentedOption<Value>[];
  /** The one chosen, or none while it is not known yet. */
  value: Value | null;
  onChange: (value: Value) => void;
  /** As wide as what holds it, its options of one width. */
  fill?: boolean;
  disabled?: boolean;
};

export function Segmented<Value extends string>({
  label,
  options,
  value,
  onChange,
  fill = false,
  disabled = false,
}: SegmentedProps<Value>) {
  const { colors, space, motion } = useTheme();
  const [layouts, setLayouts] = useState<Partial<Record<Value, LayoutRectangle>>>({});
  const chosen = value === null ? undefined : layouts[value];

  const left = useSharedValue(0);
  const width = useSharedValue(0);
  const [placed, setPlaced] = useState(false);

  useEffect(() => {
    if (!chosen) return;
    if (!placed) {
      // The first place is taken at once: the indicator comes in where it stands.
      left.set(chosen.x);
      width.set(chosen.width);
      setPlaced(true);
      return;
    }
    const timing = {
      duration: motion.duration,
      easing: Easing.bezier(motion.easing[0], motion.easing[1], motion.easing[2], motion.easing[3]),
    };
    left.set(withTiming(chosen.x, timing));
    width.set(withTiming(chosen.width, timing));
  }, [chosen, placed, left, width, motion]);

  const indicator = useAnimatedStyle(() => ({
    width: width.get(),
    transform: [{ translateX: left.get() }],
  }));

  const slop = Math.ceil((TARGET - SEGMENT_HEIGHT - 2 * space.xxs) / 2);

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={label}
      style={{
        flexDirection: "row",
        alignSelf: fill ? "stretch" : "flex-start",
        padding: space.xxs,
        // The web's: the pill's segments stand two points apart, and it is round at its ends
        // however tall Dynamic Type makes it.
        gap: 2,
        borderRadius: 9999,
        backgroundColor: colors["neutral-3"],
      }}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            top: chosen?.y ?? space.xxs,
            left: 0,
            height: chosen?.height ?? SEGMENT_HEIGHT,
            borderRadius: 9999,
            backgroundColor: colors["neutral-1"],
            opacity: placed && chosen ? 1 : 0,
          },
          edge(colors["neutral-10-transparent"]),
          indicator,
        ]}
      />
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityLabel={option.label}
            accessibilityState={{ selected, disabled }}
            disabled={disabled}
            hitSlop={{ top: slop, bottom: slop }}
            onLayout={(event) => {
              const layout = event.nativeEvent.layout;
              setLayouts((known) => ({ ...known, [option.value]: layout }));
            }}
            onPress={() => {
              if (selected) return;
              feel("select");
              onChange(option.value);
            }}
            style={{
              minHeight: SEGMENT_HEIGHT,
              flex: fill ? 1 : undefined,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: space.s,
            }}
          >
            {({ pressed }) => (
              <Text
                size="s"
                weight={selected ? "medium" : "regular"}
                dense
                numberOfLines={1}
                style={{
                  color: disabled
                    ? colors["neutral-4"]
                    : selected || pressed
                      ? colors["neutral-10"]
                      : colors["neutral-6"],
                }}
              >
                {option.label}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}
