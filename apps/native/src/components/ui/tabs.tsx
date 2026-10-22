import { useEffect, useState } from "react";
import { type LayoutRectangle, Pressable, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { useTheme } from "@/lib/theme";
import { border } from "@/theme/tokens";

import { feel } from "./haptics";
import { TARGET } from "./metrics";
import { Text } from "./text";

// The parts of one screen, as the web's `TabsList` draws them by default, its "underline": the
// names in the body's size a step apart, the one in view in the theme's ink and the others in
// its sixth grey, over a fine rule of its fourth grey, with a line of the ink under the one in
// view that moves to the next on the theme's motion (Reanimated keeps it still for a reader who
// asked for no motion). `Segmented` is the web's "segment", for a choice of a value instead.

export type TabOption<Value extends string> = { value: Value; label: string };

type TabsProps<Value extends string> = {
  /** What the parts are of, which a screen reader says before them. */
  label: string;
  options: readonly TabOption<Value>[];
  value: Value;
  onChange: (value: Value) => void;
};

export function Tabs<Value extends string>({ label, options, value, onChange }: TabsProps<Value>) {
  const { colors, space, type, motion } = useTheme();
  const [layouts, setLayouts] = useState<Partial<Record<Value, LayoutRectangle>>>({});
  const chosen = layouts[value];

  const left = useSharedValue(0);
  const width = useSharedValue(0);
  const [placed, setPlaced] = useState(false);

  useEffect(() => {
    if (!chosen) return;
    if (!placed) {
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

  const slop = Math.ceil(Math.max(0, TARGET - type.m.line - 2 * space.xs) / 2);

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={label}
      style={{ flexDirection: "row", gap: space.l }}
    >
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: border.s,
          backgroundColor: colors["neutral-4"],
        }}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            left: 0,
            bottom: 0,
            height: border.m,
            backgroundColor: colors["neutral-10"],
            opacity: placed && chosen ? 1 : 0,
          },
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
            accessibilityState={{ selected }}
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
            style={{ paddingVertical: space.xs }}
          >
            {({ pressed }) => (
              <Text
                numberOfLines={1}
                style={{ color: selected || pressed ? colors["neutral-10"] : colors["neutral-6"] }}
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
