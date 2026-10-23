import { useRef, useState } from "react";
import { View } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { useTheme } from "@/lib/theme";

import { edge } from "./edge";
import { feel } from "./haptics";
import { TARGET } from "./metrics";

// A slider with one thumb, as the web's `Slider` draws one on a phone: a line of the theme's third
// grey, filled in its accent up to the thumb, and a thumb of 20 points on the theme's ground inside
// a line of its accent, which grows a little while a finger holds it, unless the reader asked for
// no motion. The thumb stays between the line's two ends, as the web's does (`thumbAlignment
// "edge"`). It moves by its steps and is felt at each, as a picker's wheel is, and a press on the
// line brings it there. A screen reader finds it as a control it raises and lowers by a step. Two
// thumbs are the alerts' `RangeSlider`.

const THUMB = 20;
const LINE = 4;
// The web's `data-dragging:scale-120`.
const HELD = 1.2;

/** The step nearest a value, within the ends, written without what adding a tenth leaves. */
function snapped(value: number, min: number, max: number, step: number) {
  const steps = Math.round((value - min) / step);
  return Math.round(Math.min(max, Math.max(min, min + steps * step)) * 1e6) / 1e6;
}

type SliderProps = {
  /** What is set, which a screen reader says. */
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** A value in words, which a screen reader says: "1 h 30". */
  format?: (value: number) => string;
  /** The thumb moved by a step at least. */
  onChange: (value: number) => void;
  disabled?: boolean;
};

export function Slider({
  label,
  value,
  min,
  max,
  step,
  format = String,
  onChange,
  disabled = false,
}: SliderProps) {
  const { colors, motion } = useTheme();
  const still = useReducedMotion();
  const [width, setWidth] = useState(0);
  const run = Math.max(1, width - THUMB);
  const at = (one: number) => ((one - min) / (max - min || 1)) * run;
  // The value as it last was, which a gesture reads between two renders, and what the gesture
  // reads of this drawing: it may keep its first callbacks.
  const latest = useRef(value);
  latest.current = value;
  const drawn = useRef({ onChange, min, max, step, run });
  drawn.current = { onChange, min, max, step, run };
  const scale = useSharedValue(1);
  const grown = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  const timing = {
    duration: motion.duration,
    easing: Easing.bezier(motion.easing[0], motion.easing[1], motion.easing[2], motion.easing[3]),
  };

  const move = (next: number) => {
    if (next === latest.current) return;
    latest.current = next;
    feel("select");
    drawn.current.onChange(next);
  };
  const valueAtX = (x: number) => {
    const { min: least, max: most, step: by, run: line } = drawn.current;
    return snapped(least + ((x - THUMB / 2) / line) * (most - least), least, most, by);
  };

  const pan = usePanGesture({
    enabled: !disabled,
    minDistance: 0,
    runOnJS: true,
    shouldCancelWhenOutside: false,
    onBegin: (event) => {
      if (!still) scale.set(withTiming(HELD, timing));
      move(valueAtX(event.x));
    },
    onUpdate: (event) => move(valueAtX(event.x)),
    onFinalize: () => {
      scale.set(withTiming(1, timing));
    },
  });

  const left = at(Math.min(max, Math.max(min, value)));
  return (
    <GestureDetector gesture={pan}>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ min, max, now: value, text: format(value) }}
        accessibilityState={{ disabled }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(event) => {
          if (disabled) return;
          const up = event.nativeEvent.actionName === "increment";
          move(snapped(latest.current + (up ? step : -step), min, max, step));
        }}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        style={{ height: TARGET, justifyContent: "center" }}
      >
        <View
          style={{ height: LINE, borderRadius: LINE / 2, backgroundColor: colors["neutral-3"] }}
        />
        {width > 0 ? (
          <>
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                left: 0,
                width: left + THUMB / 2,
                height: LINE,
                borderRadius: LINE / 2,
                backgroundColor: disabled ? colors["neutral-5"] : colors["color-1"],
              }}
            />
            <Animated.View
              pointerEvents="none"
              style={[
                {
                  position: "absolute",
                  top: (TARGET - THUMB) / 2,
                  left,
                  width: THUMB,
                  height: THUMB,
                  borderRadius: THUMB / 2,
                  backgroundColor: disabled ? colors["neutral-2"] : colors["neutral-1"],
                },
                edge(disabled ? colors["neutral-5-transparent"] : colors["color-1"]),
                grown,
              ]}
            />
          </>
        ) : null}
      </View>
    </GestureDetector>
  );
}
