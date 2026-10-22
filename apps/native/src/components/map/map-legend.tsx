import {
  type ScaleStop,
  WAVE_HEIGHT_SCALE,
  WIND_SPEED_SCALE,
  NO_READING_COLOR,
} from "@repo/client/sea-scales";
import { ChevronDownIcon, InfoIcon, LayersIcon } from "@repo/ui/icon";
import { Pressable, ScrollView, View } from "react-native";
import { useEffect } from "react";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { Glyph } from "@/components/shared/glyph";
import { edge } from "@/components/ui/edge";
import { feel } from "@/components/ui/haptics";
import { ROUND, TARGET } from "@/components/ui/metrics";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/text";
import { formatNumber } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { heightFigure, heightUnit, useUnits, windFigure, windUnit } from "@/lib/units";
import { m } from "@/paraglide/messages";

import { FADE } from "./features";
import type { MapLayers } from "./layers";

// What the map's colors mean, and the switch of each of its layers: the web's `MapLegend` as a
// phone has it (decision 040), at the bottom left of the map where the thumb is, its title kept
// where it was pressed and what it opens growing up from there. Its last line opens the map's
// credits, which the licences ask a reader to find: OpenStreetMap's and OpenFreeMap's always,
// and Copernicus's whenever the sea is colored (decision 018).

// The values written under a scale. The others only take part in the gradient.
const WAVE_TICKS = [0, 1, 2, 3, 5, 8];
const WIND_TICKS = [0, 10, 20, 30, 50];
const WIDTH = 256;
// The platform's switch is wider and taller than the web's, 38 by 22: the legend draws it at three
// quarters, which is 38 by 23 on an iPhone, and takes the room that it then leaves.
const SWITCH_SCALE = 0.75;
const SWITCH = { width: 51, height: 31 };
// A row is as tall as its switch drawn small, and a finger is given the rest of a target around it.
const ROW = Math.ceil(SWITCH.height * SWITCH_SCALE);
// The line of the credits, as the web's.
const CREDITS_ROW = 32;

/** A scale as a bar, its stops evenly spaced, so that the small values get as much room. */
function ScaleBar({
  scale,
  ticks,
  figure = formatNumber,
}: {
  scale: readonly ScaleStop[];
  ticks: number[];
  figure?: (tick: number) => string;
}) {
  const last = scale.length - 1;
  const gradient = scale.map((stop, index) => `${stop.color} ${(index / last) * 100}%`).join(", ");
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ gap: 2 }}
    >
      <View
        style={{
          height: 8,
          borderRadius: 4,
          backgroundImage: `linear-gradient(to right, ${gradient})`,
        }}
      />
      <View style={{ height: 15 }}>
        {ticks.map((tick) => {
          const index = scale.findIndex((stop) => stop.value === tick);
          const at = (index / last) * 100;
          return (
            <Text
              key={tick}
              size="xs"
              tone="muted"
              numeric
              dense
              style={{
                position: "absolute",
                top: 0,
                // The first is written from its stop, the last up to it, the others around it.
                ...(index === last
                  ? { right: 0 }
                  : { left: `${at}%`, transform: [{ translateX: index === 0 ? 0 : "-50%" }] }),
              }}
            >
              {figure(tick)}
            </Text>
          );
        })}
      </View>
    </View>
  );
}

function LayerRow({
  label,
  description,
  value,
  onChange,
  children,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  children?: React.ReactNode;
}) {
  const { space } = useTheme();
  const flip = () => {
    feel(value ? "toggle-off" : "toggle-on");
    onChange(!value);
  };
  const slop = (TARGET - ROW) / 2;
  return (
    <View style={{ gap: space.xs }}>
      {/* The row is the switch's label, as the web's is: a press on either flips it. */}
      <Pressable
        accessible
        accessibilityRole="switch"
        accessibilityLabel={description ? `${label}, ${description}` : label}
        accessibilityState={{ checked: value }}
        hitSlop={{ top: slop, bottom: slop }}
        onPress={flip}
        style={{
          minHeight: ROW,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: space.s,
        }}
      >
        <Text size="s" weight="medium" style={{ flexShrink: 1 }}>
          {label}
        </Text>
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            transform: [{ scale: SWITCH_SCALE }],
            marginVertical: -(SWITCH.height * (1 - SWITCH_SCALE)) / 2,
            marginHorizontal: -(SWITCH.width * (1 - SWITCH_SCALE)) / 2,
          }}
        >
          <Switch value={value} onChange={onChange} />
        </View>
      </Pressable>
      {value ? children : null}
    </View>
  );
}

/** How recent a buoy's reading is, as the map tells it: a disc that pales as it ages. */
function Freshness() {
  const { space, colors } = useTheme();
  const items = [
    { label: m.map_fresh(), opacity: FADE.fresh },
    { label: m.map_aging(), opacity: FADE.aging },
    { label: m.map_old(), opacity: FADE.old },
  ];
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: space.s, rowGap: space.xxs }}>
      {items.map((item) => (
        <View
          key={item.label}
          style={{ flexDirection: "row", alignItems: "center", gap: space.xxs }}
        >
          <View
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              opacity: item.opacity,
              backgroundColor: WAVE_HEIGHT_SCALE[4]?.color ?? NO_READING_COLOR,
              ...edge(colors["neutral-1"]),
            }}
          />
          <Text size="xs" tone="muted">
            {item.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

type MapLegendProps = {
  layers: MapLayers;
  onLayersChange: (layers: MapLayers) => void;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  // As tall as the legend may grow over the map: what it opens scrolls past it.
  maxHeight: number;
  onShowCredits: () => void;
  // Wind stations and breaks are many: when not all of them are loaded, it says how to see them.
  windTruncated: boolean;
  breaksTruncated: boolean;
};

export function MapLegend({
  layers,
  onLayersChange,
  expanded,
  onExpandedChange,
  maxHeight,
  onShowCredits,
  windTruncated,
  breaksTruncated,
}: MapLegendProps) {
  const { colors, space, radius, motion } = useTheme();
  // The scales are written in the reader's units.
  useUnits();
  // The arrow points where the legend will go: up while it is folded. It turns on the theme's
  // motion, and stays still for a reader who asked for none.
  const reduceMotion = useReducedMotion();
  const turned = useSharedValue(expanded ? 0 : 180);
  useEffect(() => {
    const to = expanded ? 0 : 180;
    turned.value = reduceMotion
      ? to
      : withTiming(to, { duration: motion.duration, easing: Easing.bezier(...motion.easing) });
  }, [expanded, reduceMotion, turned, motion]);
  const chevron = useAnimatedStyle(() => ({ transform: [{ rotate: `${turned.value}deg` }] }));
  const set = (change: Partial<MapLayers>) => onLayersChange({ ...layers, ...change });

  return (
    <View
      accessibilityLabel={m.map_layers()}
      style={[
        {
          width: expanded ? WIDTH : undefined,
          maxWidth: "100%",
          maxHeight,
          alignSelf: "flex-start",
          flexDirection: "column-reverse",
          borderRadius: radius.xs,
          borderCurve: "continuous",
          backgroundColor: colors["neutral-1"],
          overflow: "hidden",
        },
        edge(colors["neutral-10-transparent"], { inset: true }),
      ]}
    >
      {/* The title is the button that opens and folds the legend, where the thumb pressed it. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={m.map_legend()}
        accessibilityState={{ expanded }}
        onPress={() => {
          feel("select");
          onExpandedChange(!expanded);
        }}
        style={({ pressed }) => ({
          // As tall as the round buttons beside it.
          minHeight: ROUND,
          flexDirection: "row",
          alignItems: "center",
          gap: space.xs,
          paddingHorizontal: space.m,
          backgroundColor: pressed ? colors["neutral-3"] : undefined,
        })}
      >
        <Glyph icon={LayersIcon} size={16} color={colors["neutral-7"]} />
        <Text weight="medium" dense numberOfLines={1} style={{ flexShrink: 1 }}>
          {m.map_legend()}
        </Text>
        <Animated.View style={[{ marginLeft: "auto" }, chevron]}>
          <Glyph icon={ChevronDownIcon} size={16} color={colors["neutral-7"]} />
        </Animated.View>
      </Pressable>

      {expanded ? (
        // It comes in at once, as the web's does.
        <View style={{ flexShrink: 1 }}>
          <ScrollView
            contentContainerStyle={{
              gap: space.s,
              paddingHorizontal: space.s,
              paddingTop: space.s,
            }}
          >
            <LayerRow
              label={m.map_wave_height({ unit: heightUnit() })}
              value={layers.sea}
              onChange={(sea) => set({ sea })}
            >
              <ScaleBar
                scale={WAVE_HEIGHT_SCALE}
                ticks={WAVE_TICKS}
                figure={(tick) => heightFigure(tick, 0)}
              />
            </LayerRow>
            <LayerRow
              label={m.map_wave_direction()}
              value={layers.arrows}
              onChange={(arrows) => set({ arrows })}
            />
            <LayerRow
              label={m.map_buoys()}
              value={layers.buoys}
              onChange={(buoys) => set({ buoys })}
            >
              <Freshness />
            </LayerRow>
            <LayerRow
              label={m.map_wind({ unit: windUnit() })}
              value={layers.wind}
              onChange={(wind) => set({ wind })}
            >
              <ScaleBar scale={WIND_SPEED_SCALE} ticks={WIND_TICKS} figure={windFigure} />
              {windTruncated ? (
                <Text size="xs" tone="muted">
                  {m.map_zoom_for_all()}
                </Text>
              ) : null}
            </LayerRow>
            <LayerRow
              label={m.map_breaks()}
              value={layers.breaks}
              onChange={(breaks) => set({ breaks })}
            >
              {breaksTruncated ? (
                <Text size="xs" tone="muted">
                  {m.map_zoom_for_all()}
                </Text>
              ) : null}
            </LayerRow>
            {/* Whose data the map draws: the licences ask that a reader who looks for it finds it. */}
            <Pressable
              accessibilityRole="button"
              onPress={onShowCredits}
              hitSlop={{ top: (TARGET - CREDITS_ROW) / 2, bottom: (TARGET - CREDITS_ROW) / 2 }}
              style={({ pressed }) => ({
                minHeight: CREDITS_ROW,
                marginHorizontal: -space.xxs,
                paddingHorizontal: space.xxs,
                flexDirection: "row",
                alignItems: "center",
                gap: space.xs,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Glyph icon={InfoIcon} size={16} color={colors["neutral-7"]} />
              <Text size="s" tone="muted">
                {m.map_credits()}
              </Text>
            </Pressable>
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}
