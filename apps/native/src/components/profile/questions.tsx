import { SIZES, sizeRank } from "@repo/conditions/sessions/sizes";
import { type ReactNode, useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

import { SurfSizePicture } from "@/components/sessions/surf-size";
import { edge } from "@/components/ui/edge";
import { feel } from "@/components/ui/haptics";
import { OptionCard, OptionCards, PRESS_DISTANCE } from "@/components/ui/option-card";
import { Text } from "@/components/ui/text";
import { Toggle, ToggleGroup } from "@/components/ui/toggle";
import { useTheme } from "@/lib/theme";
import { heightFigure, heightUnit, useUnits } from "@/lib/units";
import { m } from "@/paraglide/messages";

import { BOARD_WORDS, LEVEL_WORDS, READING_WORDS, sizeFace, sizeName } from "./profile-words";
import {
  ASKED_BOARDS,
  type Board,
  LEVELS,
  pickWave,
  READINGS,
  type Level,
  type Reading,
  type SurfSize,
  toggleBoard,
} from "./profiling";

// The questions an account answers of itself as a surfer, drawn as the web draws them
// (`profile-questions.tsx`): the level and the reading as cards, one under the other, the nine
// sizes as pictures to press, and the boards as outlined toggles. Each is felt as it is chosen,
// and says its state to a screen reader as well as to the eye. Decision 063.

/**
 * A question of the form: its title, its control, and what it means under it, as the web's
 * field lays them out. The boards' stand closer, as the web's group of toggles does.
 */
export function Question({
  title,
  hint,
  close = false,
  children,
}: {
  title: string;
  hint?: string | undefined;
  close?: boolean;
  children: ReactNode;
}) {
  const { space } = useTheme();
  return (
    <View style={{ gap: close ? space.xs : space.s }}>
      <Text weight="medium" accessibilityRole="header">
        {title}
      </Text>
      {children}
      {hint ? (
        <Text size="s" tone="muted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/** The level, in the catalogue's four words, each with what it means. */
export function LevelChoice({
  value,
  onPick,
}: {
  value: Level | null;
  onPick: (level: Level) => void;
}) {
  return (
    <OptionCards label={m.profile_level_title()}>
      {LEVELS.map((level) => (
        <OptionCard
          key={level}
          title={LEVEL_WORDS[level].name()}
          description={LEVEL_WORDS[level].hint()}
          selected={level === value}
          onPress={() => onPick(level)}
        />
      ))}
    </OptionCards>
  );
}

/** How well the surfer reads a forecast, in their own words. */
export function ReadingChoice({
  value,
  onPick,
}: {
  value: Reading | null;
  onPick: (reading: Reading) => void;
}) {
  return (
    <OptionCards label={m.profile_reading_title()}>
      {READINGS.map((reading) => (
        <OptionCard
          key={reading}
          title={READING_WORDS[reading]()}
          selected={reading === value}
          onPress={() => onPick(reading)}
        />
      ))}
    </OptionCards>
  );
}

/** The boards ridden, as many as the surfer says, each a toggle that is pressed in or out. */
export function BoardChoice({
  value,
  onChange,
}: {
  value: Board[] | null;
  onChange: (boards: Board[] | null) => void;
}) {
  return (
    <ToggleGroup label={m.profile_boards_title()}>
      {ASKED_BOARDS.map((board) => (
        <Toggle
          key={board}
          label={BOARD_WORDS[board]?.() ?? board}
          pressed={value?.includes(board) ?? false}
          onPress={() => onChange(toggleBoard(value, board))}
          size="m"
        />
      ))}
    </ToggleGroup>
  );
}

/**
 * One size to press: its picture, its name and the height of face it stands for. An end of the
 * range stands on the theme's third grey with a line of its ink around it, a size between on the
 * grey alone, and the others on nothing but their line. The grey comes on the theme's motion,
 * `order` steps of 40 ms after a press, so that a range fills from its smallest as it is said.
 */
function SizeTile({
  size,
  state,
  order,
  onPress,
}: {
  size: SurfSize;
  // An end of the range, a size inside it, one under the smallest once it is said, or none.
  state: "end" | "between" | "below" | "none";
  order: number;
  onPress: () => void;
}) {
  const { colors, space, radius, border, motion } = useTheme();
  const face = sizeFace(size, heightFigure, heightUnit());
  const isIn = state === "end" || state === "between";
  const filled = useSharedValue(isIn ? 1 : 0);

  useEffect(() => {
    const timing = withTiming(isIn ? 1 : 0, {
      duration: motion.duration,
      easing: Easing.bezier(motion.easing[0], motion.easing[1], motion.easing[2], motion.easing[3]),
    });
    filled.set(isIn ? withDelay(order * 40, timing) : timing);
  }, [isIn, order, filled, motion]);

  const ground = useAnimatedStyle(() => ({ opacity: filled.get() }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${sizeName(size)}, ${face}`}
      accessibilityState={{ selected: isIn }}
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexBasis: "30%",
          flexGrow: 1,
          gap: space.xxs,
          padding: space.xs,
          alignItems: "center",
          borderRadius: radius.xs,
          borderCurve: "continuous",
          backgroundColor: pressed ? colors["neutral-3-transparent"] : undefined,
          opacity: state === "below" ? 0.35 : 1,
          transform: [{ translateY: pressed ? PRESS_DISTANCE : 0 }],
        },
        edge(state === "end" ? colors["neutral-10"] : colors["neutral-4"], {
          width: state === "end" ? border.m : border.s,
        }),
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { borderRadius: radius.xs, borderCurve: "continuous" },
          { backgroundColor: colors["neutral-3"] },
          ground,
        ]}
      />
      <SurfSizePicture size={size} />
      <Text size="s" weight="medium" dense numberOfLines={2} style={{ textAlign: "center" }}>
        {sizeName(size)}
      </Text>
      <Text size="xs" tone="muted" numeric dense numberOfLines={1}>
        {face}
      </Text>
    </Pressable>
  );
}

/**
 * The waves surfed, from the smallest to the biggest, among the nine sizes a session says: a
 * first press says the smallest, a second the biggest, and the sizes between are marked; a press
 * after that begins again. What to press next is said over them, and read as it changes.
 */
export function WaveRange({
  smallest,
  biggest,
  onChange,
}: {
  smallest: SurfSize | null;
  biggest: SurfSize | null;
  onChange: (smallest: SurfSize | null, biggest: SurfSize | null) => void;
}) {
  const { space, motion } = useTheme();
  useUnits();
  const isHalf = smallest !== null && biggest === null;
  const stateOf = (size: SurfSize) => {
    if (size === smallest || size === biggest) return "end" as const;
    const rank = sizeRank(size);
    if (smallest !== null && biggest !== null) {
      if (rank > sizeRank(smallest) && rank < sizeRank(biggest)) return "between" as const;
    }
    if (isHalf && rank < sizeRank(smallest)) return "below" as const;
    return "none" as const;
  };

  // Once the biggest is said, the sizes up to it fill one after the other, from the smallest.
  const orderOf = (size: SurfSize) =>
    smallest !== null && biggest !== null ? sizeRank(size) - sizeRank(smallest) : 0;

  return (
    <View style={{ gap: space.s }}>
      <Text size="s" tone="muted" accessibilityLiveRegion="polite">
        {isHalf ? m.profile_waves_second() : m.profile_waves_first()}
      </Text>
      <Animated.View
        layout={LinearTransition.duration(motion.duration)}
        role="group"
        accessibilityLabel={m.profile_waves_title()}
        style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}
      >
        {SIZES.map((size) => (
          <SizeTile
            key={size}
            size={size}
            state={stateOf(size)}
            order={orderOf(size)}
            onPress={() => {
              feel("select");
              const next = pickWave(SIZES, { smallest, biggest }, size);
              onChange(next.smallest, next.biggest);
            }}
          />
        ))}
      </Animated.View>
    </View>
  );
}
