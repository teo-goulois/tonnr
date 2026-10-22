import { type ComponentRef, useEffect, useRef, useState } from "react";
import { type LayoutRectangle, Pressable, ScrollView, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { useTheme } from "@/lib/theme";

import { feel } from "./haptics";
import { TARGET } from "./metrics";
import { Text } from "./text";

// The views of one thing, as the web's tabs draw them by default (`TabsList`, its `underline`
// look): names in the body's type a large step apart, the one in view in the theme's ink and the
// others in its faint grey, a line of the theme's middle width under the one in view, which moves
// to the next on the theme's motion and stays still for a reader who asked for no motion, and a
// fine rule under the whole row. A row wider than its place scrolls, and brings the tab chosen
// into view.

export type TabOption<Value extends string> = { value: Value; label: string };

type TabsProps<Value extends string> = {
  /** What the tabs are of, which a screen reader says before them. */
  label: string;
  options: readonly TabOption<Value>[];
  /** The one in view. */
  value: Value;
  onChange: (value: Value) => void;
  /**
   * The room of what holds the row, which it crosses to its edges as it scrolls, so that a tab
   * cut by one says that more follow. Its rule stays under the tabs.
   */
  bleed?: number;
};

export function Tabs<Value extends string>({
  label,
  options,
  value,
  onChange,
  bleed = 0,
}: TabsProps<Value>) {
  const { colors, space, type, border, motion } = useTheme();
  const reducedMotion = useReducedMotion();
  const [layouts, setLayouts] = useState<Partial<Record<Value, LayoutRectangle>>>({});
  const chosen = layouts[value];

  const left = useSharedValue(0);
  const width = useSharedValue(0);
  const [placed, setPlaced] = useState(false);

  useEffect(() => {
    if (!chosen) return;
    if (!placed) {
      // The first place is taken at once: the line comes in where it stands.
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

  // What of the row is in view, to bring a tab chosen out of it into it.
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const offset = useRef(0);
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!chosen || frame === 0) return;
    const start = chosen.x - bleed;
    const end = chosen.x + chosen.width + bleed;
    const to =
      start < offset.current ? start : end > offset.current + frame ? end - frame : undefined;
    if (to !== undefined) scroller.current?.scrollTo({ x: to, animated: !reducedMotion });
  }, [chosen, frame, bleed, reducedMotion]);

  // The web's tab: the body's line, a step of room above and under it. The row reaches a
  // finger's height above and under, past the room it takes, so that each tab's target stays
  // inside what scrolls, which no press reaches beyond.
  const height = type.m.line + 2 * space.xs;
  const slop = Math.ceil(Math.max(0, TARGET - height) / 2);
  const side = Math.floor(space.l / 2);

  return (
    <ScrollView
      ref={scroller}
      horizontal
      // A row that fits stays still: iOS would let it be dragged and spring back.
      alwaysBounceHorizontal={false}
      showsHorizontalScrollIndicator={false}
      accessibilityRole="tablist"
      accessibilityLabel={label}
      onLayout={(event) => setFrame(event.nativeEvent.layout.width)}
      onScroll={(event) => {
        offset.current = event.nativeEvent.contentOffset.x;
      }}
      scrollEventThrottle={32}
      style={{ flexGrow: 0, marginHorizontal: -bleed, marginVertical: -slop }}
      contentContainerStyle={{
        flexGrow: 1,
        gap: space.l,
        paddingHorizontal: bleed,
        paddingVertical: slop,
      }}
    >
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: bleed,
          right: bleed,
          bottom: slop,
          height: border.s,
          backgroundColor: colors["neutral-4"],
        }}
      />
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityLabel={option.label}
            accessibilityState={{ selected }}
            // A short name, "Guía", is narrower than a finger: each reaches into half the step
            // that stands between it and the next.
            hitSlop={{ top: slop, bottom: slop, left: side, right: side }}
            onLayout={(event) => {
              const layout = event.nativeEvent.layout;
              setLayouts((known) => ({ ...known, [option.value]: layout }));
            }}
            onPress={() => {
              if (selected) return;
              feel("select");
              onChange(option.value);
            }}
            style={{ minHeight: height, justifyContent: "center", paddingVertical: space.xs }}
          >
            {({ pressed }) => (
              <Text
                dense
                numberOfLines={1}
                style={{ color: selected || pressed ? colors["neutral-10"] : colors["neutral-6"] }}
              >
                {option.label}
              </Text>
            )}
          </Pressable>
        );
      })}
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            left: 0,
            bottom: slop,
            height: border.m,
            backgroundColor: colors["neutral-10"],
            opacity: placed && chosen ? 1 : 0,
          },
          indicator,
        ]}
      />
    </ScrollView>
  );
}
