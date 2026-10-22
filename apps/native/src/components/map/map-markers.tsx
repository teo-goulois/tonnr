import {
  GAUGE,
  GAUGE_CHIP,
  GAUGE_RADIUS,
  gaugeDashes,
  SELECTED_SCALE,
} from "@repo/client/map/markers";
import { scaleColor, scaleInk, WAVE_HEIGHT_SCALE, WIND_SPEED_SCALE } from "@repo/client/sea-scales";
import { ArrowUpIcon, BookmarkFillIcon, PinIcon, WaveIcon } from "@repo/ui/icon";
import { useEffect, useState } from "react";
import { type LayoutChangeEvent, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";

import { Glyph } from "@/components/shared/glyph";
import { edge } from "@/components/ui/edge";
import { Text } from "@/components/ui/text";
import type { Freshness } from "@/lib/format";
import { formatSeconds } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { formatHeight, useUnits, windFigure } from "@/lib/units";

// What the map draws over itself as views, as the web's `map-markers.tsx` draws them over its
// canvas: the same sizes, colors and room, in the theme's type, Geist, medium at 12 points for a
// figure or a name and regular at 11 for what follows it, as Téo chose for both apps. A figure of
// the map keeps its size whatever Dynamic Type asks, as the web's does.

// The pills are as tall as the web's, with a disc of 24 points in them.
const PILL = 28;
const DISC = 24;
// The figure of a pill, which no step of the theme is: 12 points.
const FIGURE = { fontSize: 12, lineHeight: 16 };
// A press of the map's pills and badges: what the platform's own annotation takes.
const FIXED = 1;
// The ring of the gauge, whose dashes a phone measures in points.
const SLOT = (2 * Math.PI * GAUGE_RADIUS) / GAUGE.bars;

/** An arrow that points where the waves or the wind are going, from the bearing they come from. */
function DirectionArrow({ fromDegrees, color }: { fromDegrees: number; color: string }) {
  return (
    <View style={{ transform: [{ rotate: `${fromDegrees + 180}deg` }] }}>
      <Glyph icon={ArrowUpIcon} size={12} color={color} strokeWidth={2.25} />
    </View>
  );
}

/**
 * How recent a reading is, as a ring of bars around the chip of a pill: full when the reading is
 * fresh, and emptier as it ages. It fills a box of 24 points, over what its parent centers in it.
 */
export function FreshnessGauge({
  freshness,
  color,
  onDark = false,
}: {
  freshness: Freshness;
  // The color of the lit bars: the pill gives its wave height's, the legend its ink.
  color: string;
  onDark?: boolean;
}) {
  const { colors } = useTheme();
  const dashes = gaugeDashes(freshness, SLOT);
  const circle = {
    cx: GAUGE.box / 2,
    cy: GAUGE.box / 2,
    r: GAUGE_RADIUS,
    strokeWidth: GAUGE.stroke,
    strokeDashoffset: dashes.offset,
    fill: "none",
  };
  return (
    <Svg
      width={GAUGE.box}
      height={GAUGE.box}
      viewBox={`0 0 ${GAUGE.box} ${GAUGE.box}`}
      // The first bar starts at the top.
      style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}
    >
      <Circle
        {...circle}
        strokeDasharray={dashes.track}
        stroke={onDark ? colors["neutral-1"] : colors["neutral-4"]}
        strokeOpacity={onDark ? 0.25 : 1}
      />
      {dashes.lit ? <Circle {...circle} strokeDasharray={dashes.lit} stroke={color} /> : null}
    </Svg>
  );
}

/** The disc that says a wave height by its color, with the direction of the waves when known. */
function HeightChip({
  heightMeters,
  directionDegrees,
}: {
  heightMeters: number;
  directionDegrees: number | null;
}) {
  return (
    <View
      style={{
        width: GAUGE_CHIP,
        height: GAUGE_CHIP,
        borderRadius: GAUGE_CHIP / 2,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: scaleColor(WAVE_HEIGHT_SCALE, heightMeters),
      }}
    >
      {directionDegrees !== null ? (
        <DirectionArrow
          fromDegrees={directionDegrees}
          color={scaleInk(WAVE_HEIGHT_SCALE, heightMeters)}
        />
      ) : null}
    </View>
  );
}

type BuoyPillProps = {
  heightMeters: number;
  periodSeconds: number | null;
  directionDegrees: number | null;
  freshness: Freshness;
  selected?: boolean;
  saved?: boolean;
  // What a screen reader says of it.
  label?: string;
};

/** A buoy on the map: its wave height, period and direction, and how recent the reading is. */
export function BuoyPill({
  heightMeters,
  periodSeconds,
  directionDegrees,
  freshness,
  selected = false,
  saved = false,
  label,
}: BuoyPillProps) {
  const { colors, space } = useTheme();
  // The height is written in the reader's unit.
  useUnits();
  const ink = selected ? colors["neutral-1"] : colors["neutral-10"];
  return (
    <View
      accessible={label !== undefined}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={{
        height: PILL,
        flexDirection: "row",
        alignItems: "center",
        gap: space.xxs,
        paddingVertical: 2,
        paddingLeft: 2,
        paddingRight: space.xs,
        borderRadius: PILL / 2,
        borderCurve: "continuous",
        backgroundColor: selected ? colors["color-1"] : colors["neutral-1"],
        ...edge(colors["neutral-10-transparent"]),
        transform: selected ? [{ scale: SELECTED_SCALE }] : [],
      }}
    >
      <View style={{ width: DISC, height: DISC, alignItems: "center", justifyContent: "center" }}>
        <FreshnessGauge
          freshness={freshness}
          color={scaleColor(WAVE_HEIGHT_SCALE, heightMeters)}
          onDark={selected}
        />
        <HeightChip heightMeters={heightMeters} directionDegrees={directionDegrees} />
      </View>
      <Text weight="medium" numeric maxFontSizeMultiplier={FIXED} style={[FIGURE, { color: ink }]}>
        {formatHeight(heightMeters)}
      </Text>
      {periodSeconds !== null ? (
        <Text
          size="xs"
          numeric
          maxFontSizeMultiplier={FIXED}
          style={{ color: selected ? colors["neutral-4"] : colors["neutral-7"] }}
        >
          {formatSeconds(periodSeconds)}
        </Text>
      ) : null}
      {saved ? <Glyph icon={BookmarkFillIcon} size={10} color={ink} /> : null}
    </View>
  );
}

type WindBadgeProps = {
  speedKnots: number;
  // Null when the wind turns too much to say.
  directionDegrees: number | null;
  selected?: boolean;
  label?: string;
};

/** A wind station on the map: the speed in the reader's unit, on its color, and where it goes. */
export function WindBadge({
  speedKnots,
  directionDegrees,
  selected = false,
  label,
}: WindBadgeProps) {
  const { colors, border } = useTheme();
  useUnits();
  const ink = scaleInk(WIND_SPEED_SCALE, speedKnots);
  return (
    <View
      accessible={label !== undefined}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={{
        height: 22,
        flexDirection: "row",
        alignItems: "center",
        gap: 2,
        paddingHorizontal: 6,
        borderRadius: 11,
        borderCurve: "continuous",
        backgroundColor: scaleColor(WIND_SPEED_SCALE, speedKnots),
        // A ring of the surface, so two badges that touch stay apart; the ink's when selected.
        ...(selected
          ? edge(colors["neutral-10"], { width: border.l })
          : edge(colors["neutral-1"], { width: border.m })),
        transform: selected ? [{ scale: SELECTED_SCALE }] : [],
      }}
    >
      {directionDegrees !== null ? (
        <DirectionArrow fromDegrees={directionDegrees} color={ink} />
      ) : null}
      <Text size="xs" numeric maxFontSizeMultiplier={FIXED} style={{ color: ink }}>
        {windFigure(speedKnots)}
      </Text>
    </View>
  );
}

/**
 * The mark of a surf break: a disc with a wave in it, in the theme's ink since a break measures
 * nothing, or a pin for a spot of the reader's own.
 */
function BreakDisc({ onDark, own }: { onDark: boolean; own: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: DISC,
        height: DISC,
        borderRadius: DISC / 2,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: onDark ? colors["neutral-1"] : colors["neutral-10"],
      }}
    >
      <Glyph
        icon={own ? PinIcon : WaveIcon}
        size={14}
        strokeWidth={1.75}
        color={onDark ? colors["neutral-10"] : colors["neutral-1"]}
      />
    </View>
  );
}

/** How far the middle of a break pill's disc stands from its end: the point it is drawn on. */
export const BREAK_PILL_POINT = 2 + DISC / 2;

type BreakPillProps = {
  name: string;
  selected?: boolean;
  // A spot of the reader's own.
  own?: boolean;
  // The name before the disc, for a pill that has no room after it.
  mirrored?: boolean;
  onLayout?: (event: LayoutChangeEvent) => void;
};

/**
 * A surf break the reader has selected: its mark and its name. The map draws the breaks itself,
 * which are too many for a pill each, and puts this one over the break in hand, grown from its
 * disc when selected.
 */
export function BreakPill({
  name,
  selected = false,
  own = false,
  mirrored = false,
  onLayout,
}: BreakPillProps) {
  const { colors, space } = useTheme();
  // A mirrored pill grows from its disc at its right end, which the platform can only place from
  // its left: its width says where.
  const [width, setWidth] = useState(0);
  return (
    <View
      onLayout={(event) => {
        setWidth(event.nativeEvent.layout.width);
        onLayout?.(event);
      }}
      style={{
        height: PILL,
        maxWidth: 224,
        flexDirection: mirrored ? "row-reverse" : "row",
        alignItems: "center",
        gap: space.xxs,
        paddingVertical: 2,
        paddingLeft: mirrored ? space.s : 2,
        paddingRight: mirrored ? 2 : space.s,
        borderRadius: PILL / 2,
        borderCurve: "continuous",
        backgroundColor: selected ? colors["color-1"] : colors["neutral-1"],
        ...edge(colors["neutral-10-transparent"]),
        ...(selected && {
          transform: [{ scale: SELECTED_SCALE }],
          transformOrigin: [mirrored ? width - BREAK_PILL_POINT : BREAK_PILL_POINT, "50%", 0],
        }),
      }}
    >
      <BreakDisc onDark={selected} own={own} />
      <Text
        weight="medium"
        numberOfLines={1}
        maxFontSizeMultiplier={FIXED}
        style={[
          FIGURE,
          { flexShrink: 1, color: selected ? colors["neutral-1"] : colors["neutral-10"] },
        ]}
      >
        {name}
      </Text>
    </View>
  );
}

// The web's dot: 14 pixels in the accent with the surface's edge, over a halo 6 pixels wider on
// each side that pings as Tailwind's `animate-ping` does, a second at a time.
const DOT = 14;
const HALO = DOT + 12;
const PING_MS = 1000;

/** Where the reader was found: a dot in the accent, whose halo pings unless motion was refused. */
export function UserDot({ label }: { label: string }) {
  const { colors, border } = useTheme();
  const reduceMotion = useReducedMotion();
  const ping = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) {
      ping.value = 0;
      return;
    }
    // Out to twice its size and gone by three quarters of the second, then still.
    ping.value = withRepeat(
      withSequence(
        withTiming(1, { duration: PING_MS * 0.75, easing: Easing.bezier(0, 0, 0.2, 1) }),
        withTiming(1, { duration: PING_MS * 0.25 }),
        withTiming(0, { duration: 0 }),
      ),
      -1,
    );
  }, [reduceMotion, ping]);
  const halo = useAnimatedStyle(() => ({
    opacity: 1 - ping.value,
    transform: [{ scale: 1 + ping.value }],
  }));

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      pointerEvents="none"
      style={{ width: HALO, height: HALO, alignItems: "center", justifyContent: "center" }}
    >
      <Animated.View
        style={[
          {
            position: "absolute",
            width: HALO,
            height: HALO,
            borderRadius: HALO / 2,
            backgroundColor: colors["color-1-transparent"],
          },
          halo,
        ]}
      />
      <View
        style={{
          width: DOT,
          height: DOT,
          borderRadius: DOT / 2,
          backgroundColor: colors["color-1"],
          ...edge(colors["neutral-1"], { width: border.l }),
        }}
      />
    </View>
  );
}
