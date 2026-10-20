import type { Arc } from "@repo/client/alerts/alert-words";
import { useRef } from "react";
import { View } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Svg, { Circle, Path } from "react-native-svg";

import { feel } from "@/components/ui/haptics";
import { TARGET } from "@/components/ui/metrics";
import { Text } from "@/components/ui/text";
import { compassPoint } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

import {
  COMPASS_STEP,
  bearingOf,
  nearestEnd,
  onCompass,
  onStep,
  turnBetween,
  turned,
} from "./compass-angles";

// A sector of the compass, as the web's `CompassDial` draws one, made to be turned by a finger:
// a press near the rim takes the nearer end of the sector there and drags it, one inside turns
// the whole sector round, and each step of five degrees is felt. Where the wind comes from when
// it blows off the shore, the land is shaded on that side, so that the dial reads as the coast.
// A screen reader finds each end as a control it turns by a step. Decision 031, "The editor".

const SIZE = 248;
const RADIUS = 94;
const CENTER = SIZE / 2;
// Inside this share of the radius, a press turns the whole sector.
const TURNS_WITHIN = 0.55;

const position = (degrees: number, radius: number) => {
  const angle = (degrees * Math.PI) / 180;
  return { x: CENTER + radius * Math.sin(angle), y: CENTER - radius * Math.cos(angle) };
};

/** The path of a slice of the dial, clockwise from one bearing to another. */
function slice(from: number, to: number, radius: number) {
  const start = position(from, radius);
  const end = position(to, radius);
  const sweep = onCompass(to - from);
  return `M ${CENTER} ${CENTER} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${sweep > 180 ? 1 : 0} 1 ${end.x} ${end.y} Z`;
}

function rim(from: number, to: number, radius: number) {
  const start = position(from, radius);
  const end = position(to, radius);
  const sweep = onCompass(to - from);
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${sweep > 180 ? 1 : 0} 1 ${end.x} ${end.y}`;
}

type CompassProps = {
  /** The sector, clockwise from `from` to `to`. Equal ends are the whole compass. */
  arc: Arc;
  /** Where the swell or the wind comes from at this hour, as a dot on the rim. */
  now?: number | null;
  /** Where the wind comes from when it blows off the shore: the land is on that side. */
  offshore?: number | null;
  label: string;
  onChange: (arc: Arc) => void;
};

export function Compass({ arc, now, offshore, label, onChange }: CompassProps) {
  const { colors } = useTheme();
  const ends = { from: onCompass(arc.from), to: onCompass(arc.to) };
  const latest = useRef(ends);
  latest.current = ends;
  // What a gesture calls, as this drawing has it: the gesture may keep its first callbacks.
  const changed = useRef(onChange);
  changed.current = onChange;
  // What a finger holds: an end, or the whole sector from where it was taken.
  const holding = useRef<
    { end: "from" | "to" } | { turning: { from: number; to: number }; start: number } | null
  >(null);

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
      const dx = event.x - CENTER;
      const dy = event.y - CENTER;
      const bearing = bearingOf(dx, dy);
      const whole = latest.current.from === latest.current.to;
      if (!whole && Math.hypot(dx, dy) < RADIUS * TURNS_WITHIN) {
        holding.current = { turning: latest.current, start: bearing };
        return;
      }
      const end = nearestEnd(latest.current, bearing);
      holding.current = { end };
      change({ ...latest.current, [end]: onStep(bearing) });
    },
    onUpdate: (event) => {
      const held = holding.current;
      if (!held) return;
      const bearing = bearingOf(event.x - CENTER, event.y - CENTER);
      if ("end" in held) {
        change({ ...latest.current, [held.end]: onStep(bearing) });
        return;
      }
      const by = Math.round(turnBetween(held.start, bearing) / COMPASS_STEP) * COMPASS_STEP;
      change(turned(held.turning, by));
    },
    onFinalize: () => {
      holding.current = null;
    },
  });

  const isWhole = ends.from === ends.to;
  const points = m.compass_points().split(",");
  const mark = now == null ? null : position(now, RADIUS + 14);

  const handle = (end: "from" | "to") => {
    const at = position(ends[end], RADIUS);
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
    <GestureDetector gesture={pan}>
      <View
        accessibilityRole="none"
        accessibilityLabel={label}
        style={{ width: SIZE, height: SIZE, alignSelf: "center" }}
      >
        <Svg width={SIZE} height={SIZE}>
          {offshore != null ? (
            // The land, on the side the offshore wind comes from.
            <Path d={slice(offshore - 90, offshore + 90, RADIUS)} fill={colors["neutral-3"]} />
          ) : null}
          <Circle
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            fill="none"
            stroke={colors["neutral-4"]}
            strokeWidth={2}
          />
          {isWhole ? (
            <Circle
              cx={CENTER}
              cy={CENTER}
              r={RADIUS}
              fill={colors["color-1-transparent"]}
              stroke={colors["color-1"]}
              strokeWidth={6}
            />
          ) : (
            <>
              <Path d={slice(ends.from, ends.to, RADIUS)} fill={colors["color-1-transparent"]} />
              <Path
                d={rim(ends.from, ends.to, RADIUS)}
                fill="none"
                stroke={colors["color-1"]}
                strokeWidth={6}
                strokeLinecap="round"
              />
            </>
          )}
          {mark ? <Circle cx={mark.x} cy={mark.y} r={4} fill={colors["neutral-10"]} /> : null}
          {(["from", "to"] as const).map((end) => {
            const at = position(ends[end], RADIUS);
            return (
              <Circle
                key={end}
                cx={at.x}
                cy={at.y}
                r={11}
                fill={colors["neutral-1"]}
                stroke={colors["color-1"]}
                strokeWidth={3}
              />
            );
          })}
        </Svg>
        {[0, 4, 8, 12].map((index) => {
          const at = position(index * 22.5, RADIUS - 22);
          return (
            <View
              key={index}
              pointerEvents="none"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{
                position: "absolute",
                left: at.x - 16,
                top: at.y - 10,
                width: 32,
                height: 20,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text size="xs" tone="muted" dense maxFontSizeMultiplier={1}>
                {points[index]}
              </Text>
            </View>
          );
        })}
        {handle("from")}
        {handle("to")}
      </View>
    </GestureDetector>
  );
}
