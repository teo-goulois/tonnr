import { SIZES, sizeRank } from "@repo/conditions/sessions/sizes";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import Animated, { LinearTransition } from "react-native-reanimated";

import { ChoiceList } from "@/components/account/choice-list";
import { SurfSizePicture } from "@/components/sessions/surf-size";
import { Chip } from "@/components/ui/chip";
import { edge } from "@/components/ui/edge";
import { feel } from "@/components/ui/haptics";
import { Text } from "@/components/ui/text";
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

// The questions an account answers of itself as a surfer, as the web asks them
// (`profile-questions.tsx`), drawn as a phone draws a choice: a list whose row in force is
// checked, the nine sizes as pictures to press, and the boards as chips. Each is felt as it is
// chosen, and says its state to a screen reader as well as to the eye. Decision 063.

/** A question's title, and what it means, over its choices. */
export function Question({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string | undefined;
  children: ReactNode;
}) {
  const { space } = useTheme();
  return (
    <View style={{ gap: space.s }}>
      <View style={{ gap: space.xxs, paddingHorizontal: space.m }}>
        <Text weight="medium" accessibilityRole="header">
          {title}
        </Text>
        {hint ? (
          <Text size="s" tone="muted">
            {hint}
          </Text>
        ) : null}
      </View>
      {children}
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
    <ChoiceList
      choices={LEVELS.map((level) => ({
        value: level,
        title: LEVEL_WORDS[level].name(),
        description: LEVEL_WORDS[level].hint(),
      }))}
      value={value}
      onChoose={onPick}
    />
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
    <ChoiceList
      choices={READINGS.map((reading) => ({ value: reading, title: READING_WORDS[reading]() }))}
      value={value}
      onChoose={onPick}
    />
  );
}

/** The boards ridden, as many as the surfer says, each a chip that is pressed in or out. */
export function BoardChoice({
  value,
  onChange,
}: {
  value: Board[] | null;
  onChange: (boards: Board[] | null) => void;
}) {
  const { space } = useTheme();
  return (
    <View
      role="group"
      accessibilityLabel={m.profile_boards_title()}
      style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}
    >
      {ASKED_BOARDS.map((board) => (
        <Chip
          key={board}
          label={BOARD_WORDS[board]?.() ?? board}
          selected={value?.includes(board) ?? false}
          onPress={() => onChange(toggleBoard(value, board))}
        />
      ))}
    </View>
  );
}

/** One size to press: its picture, its name and the height of face it stands for. */
function SizeTile({
  size,
  state,
  onPress,
}: {
  size: SurfSize;
  // An end of the range, a size inside it, one under the smallest once it is said, or none.
  state: "end" | "between" | "below" | "none";
  onPress: () => void;
}) {
  const { colors, space, radius, border } = useTheme();
  const face = sizeFace(size, heightFigure, heightUnit());
  const isIn = state === "end" || state === "between";
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
          backgroundColor: isIn || pressed ? colors["neutral-3"] : colors["cte-surface"],
          opacity: state === "below" ? 0.35 : 1,
        },
        edge(state === "end" ? colors["neutral-10"] : colors["neutral-4"], {
          inset: true,
          width: state === "end" ? border.m : border.s,
        }),
      ]}
    >
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

  return (
    <View style={{ gap: space.s }}>
      <Text
        size="s"
        tone="muted"
        accessibilityLiveRegion="polite"
        style={{ paddingHorizontal: space.m }}
      >
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
