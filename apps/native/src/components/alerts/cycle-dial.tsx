import { TIDE_CURVE, TIDE_SPANS, tidePath } from "@repo/client/alerts/tide-cycle";
import { TIDE_COLOR } from "@repo/client/sea-scales";
import { TIDE_CYCLE, type TideSegment } from "@repo/config/sea-words";
import { type ReactNode, useState } from "react";
import { Pressable, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { feel } from "@/components/ui/haptics";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

import { SEGMENT_WORDS } from "./words";

// One tide, from low water to the next, in the eight parts an alert asks for, as the web's
// `CycleDial` draws it: one curve as wide as the sheet, low water at both ends and high water in
// the middle, each part a stretch of it, thick in the tide's color while it is taken and thin in
// grey while it is not. A press takes a part or leaves it, and is felt: each part's stretch of
// the width is its own, since the curve rises and falls once. The curve and its stretches are
// packages/client's, which the web's reads too. Decision 031, "The tide".

const { width: WIDTH, height: HEIGHT } = TIDE_CURVE;
// The curve's box reaches past its two ends, as the web's does, so that the ends' lines are whole.
const LEFT = -8;
const BOX = WIDTH + 16;
// Where the words stand under the curve and over it, on their baseline, in the curve's units.
const UNDER = HEIGHT - 4;
const OVER = 10;
// How far a word's baseline stands under the top of its line, at the theme's smallest step.
const BASELINE = 10;

export function CycleDial({
  value,
  onChange,
}: {
  value: readonly TideSegment[];
  onChange: (next: TideSegment[]) => void;
}) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const scale = width / BOX;
  const x = (units: number) => (units - LEFT) * scale;
  const toggle = (segment: TideSegment) => {
    feel("select");
    onChange(
      TIDE_CYCLE.filter((one) => (one === segment ? !value.includes(one) : value.includes(one))),
    );
  };

  // A word of the curve, at its place: from its start, its middle or its end.
  const word = (text: string, at: number, baseline: number, anchor: "start" | "middle" | "end") => {
    const top = baseline * scale - BASELINE;
    const box = 120;
    const place =
      anchor === "start"
        ? { left: x(at) }
        : anchor === "end"
          ? { right: width - x(at) }
          : { left: x(at) - box / 2, width: box, alignItems: "center" as const };
    return (
      <View style={{ position: "absolute", top, ...place }}>
        <Text size="xxs" tone="muted" numberOfLines={1} maxFontSizeMultiplier={1.15}>
          {text}
        </Text>
      </View>
    );
  };

  const parts: ReactNode[] = [];
  for (const segment of TIDE_CYCLE) {
    const isOn = value.includes(segment);
    TIDE_SPANS[segment].forEach(([from, to], index) => {
      // Low water stands at both ends: a screen reader finds it once, at the first.
      const twice = index > 0;
      parts.push(
        <Pressable
          key={`${segment}-${from}`}
          accessible={!twice}
          accessibilityElementsHidden={twice}
          importantForAccessibility={twice ? "no-hide-descendants" : "yes"}
          accessibilityRole="togglebutton"
          accessibilityLabel={SEGMENT_WORDS[segment]()}
          accessibilityState={{ checked: isOn }}
          onPress={() => toggle(segment)}
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: x(from * WIDTH),
            width: (to - from) * WIDTH * scale,
          }}
        />,
      );
    });
  }

  return (
    <View
      accessibilityRole="none"
      accessibilityLabel={m.alert_label_tide()}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={{ width: "100%", aspectRatio: BOX / HEIGHT }}
    >
      <Svg width="100%" height="100%" viewBox={`${LEFT} 0 ${BOX} ${HEIGHT}`}>
        {TIDE_CYCLE.map((segment) => {
          const isOn = value.includes(segment);
          return TIDE_SPANS[segment].map((span) => (
            <Path
              key={`${segment}-${span[0]}`}
              d={tidePath(span)}
              stroke={isOn ? TIDE_COLOR : colors["neutral-5"]}
              strokeWidth={isOn ? 7 : 4}
              strokeLinecap="butt"
              fill="none"
            />
          ));
        })}
      </Svg>
      {width > 0 ? (
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
        >
          {word(m.alert_tide_low(), 0, UNDER, "start")}
          {word(m.alert_tide_high(), WIDTH / 2, OVER, "middle")}
          {word(m.alert_tide_low(), WIDTH, UNDER, "end")}
          {word(`↑ ${m.alert_trend_rising()}`, WIDTH / 4, UNDER, "middle")}
          {word(`${m.alert_trend_falling()} ↓`, (3 * WIDTH) / 4, UNDER, "middle")}
        </View>
      ) : null}
      {width > 0 ? parts : null}
    </View>
  );
}
