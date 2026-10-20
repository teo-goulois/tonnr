import { TIDE_COLOR } from "@repo/client/sea-scales";
import { TIDE_CYCLE, type TideSegment } from "@repo/config/sea-words";
import { Pressable, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { feel } from "@/components/ui/haptics";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/lib/theme";
import { light } from "@/theme/tokens";
import { m } from "@/paraglide/messages";

import { SEGMENT_WORDS } from "./words";

// One tide, from low water to the next, in the eight parts an alert asks for, as the web's
// `CycleDial` offers them: here a ring, as a tide clock draws it, high water at the top and low
// water at the bottom, the tide rising up the left and falling down the right, each part an
// eighth of it so that each is a finger's size. A press takes a part or leaves it, and is felt.
// How long each part lasts at the place is the chart's to say. Decision 031, "The tide".

const SIZE = 232;
const CENTER = SIZE / 2;
const OUTER = 108;
const INNER = 64;
// The middle of each part, clockwise from north: low water at the bottom, rising on the left.
const MIDDLES: Record<TideSegment, number> = {
  low: 180,
  mid_low_rising: 225,
  mid_rising: 270,
  mid_high_rising: 315,
  high: 0,
  mid_high_falling: 45,
  mid_falling: 90,
  mid_low_falling: 135,
};
const HALF = 22.5;
// Where a part's target stands, between the ring's two edges, and how big it is.
const TARGET_AT = (OUTER + INNER) / 2;
const TARGET_SIZE = 56;

const point = (degrees: number, radius: number) => {
  const angle = (degrees * Math.PI) / 180;
  return { x: CENTER + radius * Math.sin(angle), y: CENTER - radius * Math.cos(angle) };
};

/** A part of the ring, a band between two radii, from one bearing to another. */
function band(from: number, to: number) {
  const a = point(from, OUTER);
  const b = point(to, OUTER);
  const c = point(to, INNER);
  const d = point(from, INNER);
  return `M ${a.x} ${a.y} A ${OUTER} ${OUTER} 0 0 1 ${b.x} ${b.y} L ${c.x} ${c.y} A ${INNER} ${INNER} 0 0 0 ${d.x} ${d.y} Z`;
}

export function CycleDial({
  value,
  onChange,
}: {
  value: readonly TideSegment[];
  onChange: (next: TideSegment[]) => void;
}) {
  const { colors } = useTheme();
  const toggle = (segment: TideSegment) => {
    feel("select");
    onChange(
      TIDE_CYCLE.filter((one) => (one === segment ? !value.includes(one) : value.includes(one))),
    );
  };

  // The words stand in the ring's hole: high and low over and under, the way the tide goes
  // on each side. A long word shrinks to its half rather than run into the other.
  const word = (text: string, at: { x: number; y: number }, width: number) => (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: at.x - width / 2,
        top: at.y - 10,
        width,
        height: 20,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        size="xs"
        tone="muted"
        dense
        numberOfLines={1}
        adjustsFontSizeToFit
        maxFontSizeMultiplier={1.15}
      >
        {text}
      </Text>
    </View>
  );

  return (
    <View
      accessibilityRole="none"
      accessibilityLabel={m.alert_label_tide()}
      style={{ width: SIZE, height: SIZE, alignSelf: "center" }}
    >
      <Svg width={SIZE} height={SIZE}>
        {TIDE_CYCLE.map((segment) => {
          const on = value.includes(segment);
          return (
            <Path
              key={segment}
              d={band(MIDDLES[segment] - HALF, MIDDLES[segment] + HALF)}
              fill={on ? TIDE_COLOR : colors["neutral-3"]}
              stroke={colors["cte-canvas"]}
              strokeWidth={2}
            />
          );
        })}
      </Svg>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ position: "absolute", inset: 0 }}
        pointerEvents="none"
      >
        {word(m.alert_tide_high(), { x: CENTER, y: CENTER - 36 }, 88)}
        {word(m.alert_tide_low(), { x: CENTER, y: CENTER + 36 }, 88)}
        {word(`↑ ${m.alert_trend_rising()}`, { x: CENTER - 31, y: CENTER }, 60)}
        {word(`${m.alert_trend_falling()} ↓`, { x: CENTER + 31, y: CENTER }, 60)}
      </View>
      {TIDE_CYCLE.map((segment) => {
        const on = value.includes(segment);
        const at = point(MIDDLES[segment], TARGET_AT);
        return (
          <Pressable
            key={segment}
            accessibilityRole="button"
            accessibilityLabel={SEGMENT_WORDS[segment]()}
            accessibilityState={{ selected: on }}
            onPress={() => toggle(segment)}
            style={({ pressed }) => ({
              position: "absolute",
              left: at.x - TARGET_SIZE / 2,
              top: at.y - TARGET_SIZE / 2,
              width: TARGET_SIZE,
              height: TARGET_SIZE,
              borderRadius: TARGET_SIZE / 2,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: pressed ? colors["neutral-10-transparent"] : "transparent",
            })}
          >
            {on ? (
              // A part that is taken is told by a mark, not by its color alone.
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: light["neutral-1"],
                }}
              />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
