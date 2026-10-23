import type { Arc } from "@repo/client/alerts/alert-words";
import { COMPASS_STEP, bearingOf, onCompass, onDial, onStep } from "@repo/client/alerts/compass";
import { useRef } from "react";
import { View } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Svg, { Circle, Path } from "react-native-svg";

import { Bearing } from "@/components/forecast/bearing";
import { feel } from "@/components/ui/haptics";
import { TARGET } from "@/components/ui/metrics";
import { Text } from "@/components/ui/text";
import { compassName, compassPoint } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

// A sector of the compass, as the web's `CompassDial` draws one, at its size and with its lines:
// the rim, the four points inside it, the sector in the theme's accent, a handle at each end and,
// where the forecast says, a dot for where the sea or the wind comes from at this hour; under it
// the two ends, each an arrow and the point it comes from. A finger drags a handle, which comes to
// rest on the dial's steps and is felt at each; a press elsewhere on the dial does nothing, as on
// the web. A screen reader finds each end as a control it turns by a step. The angles are
// packages/client's, which the web's dial reads too. Decision 031, "The editor".

const SIZE = 176;
const RADIUS = 66;
const CENTER = SIZE / 2;
// How near a handle a press takes it: a finger's target around the handle that shows, as the web
// draws a circle of twenty around its handle of nine.
const REACH = TARGET / 2;

const position = (degrees: number, radius: number) => {
  const at = onDial(degrees, radius);
  return { x: CENTER + at.x, y: CENTER + at.y };
};

type CompassProps = {
  /** The sector, clockwise from `from` to `to`. Equal ends are the whole compass. */
  arc: Arc;
  /** Where the swell or the wind comes from at this hour, as a dot on the rim. */
  now?: number | null;
  label: string;
  onChange: (arc: Arc) => void;
};

export function Compass({ arc, now, label, onChange }: CompassProps) {
  const { colors, space } = useTheme();
  const ends = { from: onCompass(arc.from), to: onCompass(arc.to) };
  const latest = useRef(ends);
  latest.current = ends;
  // What a gesture calls, as this drawing has it: the gesture may keep its first callbacks.
  const changed = useRef(onChange);
  changed.current = onChange;
  // The end a finger holds, if it came down on one.
  const holding = useRef<"from" | "to" | null>(null);

  const change = (next: Arc) => {
    const current = latest.current;
    if (next.from === current.from && next.to === current.to) return;
    latest.current = next;
    feel("select");
    changed.current(next);
  };

  const pan = usePanGesture({
    minDistance: 0,
    runOnJS: true,
    shouldCancelWhenOutside: false,
    onBegin: (event) => {
      // The nearer end, when the press is within a finger of it; nothing otherwise.
      const away = (end: "from" | "to") => {
        const at = position(latest.current[end], RADIUS);
        return Math.hypot(event.x - at.x, event.y - at.y);
      };
      const end = away("from") <= away("to") ? "from" : "to";
      holding.current = away(end) <= REACH ? end : null;
    },
    onUpdate: (event) => {
      const end = holding.current;
      if (!end) return;
      change({ ...latest.current, [end]: onStep(bearingOf(event.x - CENTER, event.y - CENTER)) });
    },
    onFinalize: () => {
      holding.current = null;
    },
  });

  const from = position(ends.from, RADIUS);
  const to = position(ends.to, RADIUS);
  const sweep = onCompass(ends.to - ends.from);
  const isWhole = sweep === 0;
  const large = sweep > 180 ? 1 : 0;
  const points = m.compass_points().split(",");
  const mark = now == null ? null : position(now, RADIUS + 12);

  const handle = (end: "from" | "to") => {
    const at = end === "from" ? from : to;
    const degrees = Math.round(ends[end]);
    return (
      <View
        key={end}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={
          end === "from" ? m.alert_sector_from({ label }) : m.alert_sector_to({ label })
        }
        accessibilityValue={{
          text: m.alert_sector_value({ degrees, point: compassPoint(degrees) }),
        }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(event) => {
          const by = event.nativeEvent.actionName === "increment" ? COMPASS_STEP : -COMPASS_STEP;
          change({ ...ends, [end]: onStep(ends[end] + by) });
        }}
        style={{
          position: "absolute",
          left: at.x - TARGET / 2,
          top: at.y - TARGET / 2,
          width: TARGET,
          height: TARGET,
        }}
      />
    );
  };

  return (
    <View style={{ alignItems: "center", gap: space.xxs }}>
      <GestureDetector gesture={pan}>
        <View
          accessibilityRole="none"
          accessibilityLabel={label}
          style={{ width: SIZE, height: SIZE }}
        >
          <Svg width={SIZE} height={SIZE}>
            <Circle
              cx={CENTER}
              cy={CENTER}
              r={RADIUS}
              fill="none"
              stroke={colors["neutral-4"]}
              strokeWidth={2}
            />
            {isWhole ? (
              // Equal ends take every direction: the whole compass is drawn.
              <Circle
                cx={CENTER}
                cy={CENTER}
                r={RADIUS}
                fill={colors["color-1-transparent"]}
                stroke={colors["color-1"]}
                strokeWidth={5}
              />
            ) : (
              <>
                <Path
                  d={`M ${CENTER} ${CENTER} L ${from.x} ${from.y} A ${RADIUS} ${RADIUS} 0 ${large} 1 ${to.x} ${to.y} Z`}
                  fill={colors["color-1-transparent"]}
                />
                <Path
                  d={`M ${from.x} ${from.y} A ${RADIUS} ${RADIUS} 0 ${large} 1 ${to.x} ${to.y}`}
                  fill="none"
                  stroke={colors["color-1"]}
                  strokeWidth={5}
                  strokeLinecap="round"
                />
              </>
            )}
            {mark ? <Circle cx={mark.x} cy={mark.y} r={4} fill={colors["neutral-10"]} /> : null}
            {(["from", "to"] as const).map((end) => {
              const at = end === "from" ? from : to;
              return (
                <Circle
                  key={end}
                  cx={at.x}
                  cy={at.y}
                  r={9}
                  fill={colors["neutral-1"]}
                  stroke={colors["color-1"]}
                  strokeWidth={3}
                />
              );
            })}
          </Svg>
          {[0, 4, 8, 12].map((index) => {
            const at = position(index * 22.5, RADIUS - 16);
            return (
              <View
                key={index}
                pointerEvents="none"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={{
                  position: "absolute",
                  left: at.x - 12,
                  top: at.y - 8,
                  width: 24,
                  height: 16,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text size="xxs" tone="muted" maxFontSizeMultiplier={1}>
                  {points[index]}
                </Text>
              </View>
            );
          })}
          {handle("from")}
          {handle("to")}
        </View>
      </GestureDetector>
      <View
        accessible
        accessibilityLabel={`${compassName(ends.from)} – ${compassName(ends.to)}`}
        style={{ flexDirection: "row", alignItems: "center", gap: space.xxs }}
      >
        <Bearing degrees={ends.from} size="xs" color={colors["neutral-7"]} />
        <Text size="xs" tone="muted">
          –
        </Text>
        <Bearing degrees={ends.to} size="xs" color={colors["neutral-7"]} />
      </View>
    </View>
  );
}
