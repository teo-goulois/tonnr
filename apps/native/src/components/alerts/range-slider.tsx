import { useRef, useState } from "react";
import { View } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";

import { edge } from "@/components/ui/edge";
import { feel } from "@/components/ui/haptics";
import { TARGET } from "@/components/ui/metrics";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/lib/theme";

import { nearestThumb, snapped, stepped } from "./slider-steps";

// A slider with two thumbs, for a range of the sea: the least and the most it asks, as the web's
// `Slider` sets one with two values. A thumb moves by the steps of its range and is felt at each,
// as a picker's wheel is; a press on the line brings the nearer thumb there. A thumb taken to the
// end of the line leaves that side open, which the editor reads (`rangeAfter`). A screen reader
// finds each thumb as a control it raises and lowers by a step. Decision 031, "The editor".

/** How big a thumb is drawn, and how far the line runs from each side for it to fit. */
const THUMB = 28;
const LINE = 4;

type RangeSliderProps = {
  /** What is set, which each thumb is named after: "The height of the waves: at least". */
  leastLabel: string;
  mostLabel: string;
  /** Where the two thumbs stand, in the unit the reader reads. */
  values: readonly [number, number];
  min: number;
  max: number;
  step: number;
  /** A value as it is written: "1.5 m". */
  format: (value: number) => string;
  /** The thumbs moved by a step at least. */
  onChange: (next: [number, number]) => void;
};

export function RangeSlider({
  leastLabel,
  mostLabel,
  values,
  min,
  max,
  step,
  format,
  onChange,
}: RangeSliderProps) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const run = Math.max(1, width - THUMB);
  const at = (value: number) => ((value - min) / (max - min || 1)) * run;
  // The thumb a finger holds, and the values as they last were, which a gesture reads.
  const holding = useRef<0 | 1 | null>(null);
  const latest = useRef(values);
  latest.current = values;
  // What a gesture reads, as this drawing has it: the gesture may keep its first callbacks.
  const drawn = useRef({ onChange, min, max, step, run });
  drawn.current = { onChange, min, max, step, run };

  const move = (thumb: 0 | 1, value: number) => {
    const [least, most] = latest.current;
    // A thumb stops at the other one: the two may meet, never cross.
    const next: [number, number] =
      thumb === 0 ? [Math.min(value, most), most] : [least, Math.max(value, least)];
    if (next[0] === least && next[1] === most) return;
    latest.current = next;
    feel("select");
    drawn.current.onChange(next);
  };
  const valueAtX = (x: number) => {
    const { min: least, max: most, step: by, run: line } = drawn.current;
    return snapped(least + ((x - THUMB / 2) / line) * (most - least), least, most, by);
  };

  const pan = usePanGesture({
    minDistance: 0,
    runOnJS: true,
    shouldCancelWhenOutside: false,
    onBegin: (event) => {
      const value = valueAtX(event.x);
      const thumb = nearestThumb(latest.current, value);
      holding.current = thumb;
      move(thumb, value);
    },
    onUpdate: (event) => {
      if (holding.current === null) return;
      move(holding.current, valueAtX(event.x));
    },
    onFinalize: () => {
      holding.current = null;
    },
  });

  const [least, most] = values;
  const thumb = (index: 0 | 1) => {
    const value = values[index];
    return (
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={index === 0 ? leastLabel : mostLabel}
        accessibilityValue={{ text: format(value) }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(event) => {
          const up = event.nativeEvent.actionName === "increment";
          move(index, stepped(value, up ? 1 : -1, min, max, step));
        }}
        style={[
          {
            position: "absolute",
            top: (TARGET - THUMB) / 2,
            left: at(value),
            width: THUMB,
            height: THUMB,
            borderRadius: THUMB / 2,
            backgroundColor: colors["neutral-1"],
          },
          edge(colors["neutral-5"]),
        ]}
      />
    );
  };

  return (
    <View style={{ gap: 2 }}>
      <GestureDetector gesture={pan}>
        <View
          onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
          style={{ height: TARGET, justifyContent: "center" }}
        >
          <View
            style={{
              marginHorizontal: THUMB / 2,
              height: LINE,
              borderRadius: LINE / 2,
              backgroundColor: colors["neutral-4"],
            }}
          />
          {width > 0 ? (
            <>
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  left: THUMB / 2 + at(least),
                  width: Math.max(0, at(most) - at(least)),
                  height: LINE,
                  borderRadius: LINE / 2,
                  backgroundColor: colors["color-1"],
                }}
              />
              {thumb(0)}
              {thumb(1)}
            </>
          ) : null}
        </View>
      </GestureDetector>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ flexDirection: "row", justifyContent: "space-between" }}
      >
        <Text size="xs" tone="muted" numeric dense>
          {format(min)}
        </Text>
        <Text size="xs" tone="muted" numeric dense>
          {format(max)}
        </Text>
      </View>
    </View>
  );
}
