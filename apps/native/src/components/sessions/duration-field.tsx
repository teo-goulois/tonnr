import {
  LEAST_MINUTES,
  MOST_MINUTES,
  STEP_MINUTES,
  USUAL_LENGTHS,
  withinLengths,
} from "@repo/client/sessions/rules";
import { MinusIcon, PlusIcon } from "@repo/ui/icon";
import { useState } from "react";
import { View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

import { IconButton } from "@/components/ui/button";
import { Chip, ChipRow } from "@/components/ui/chip";
import { feel } from "@/components/ui/haptics";
import { Text } from "@/components/ui/text";
import { formatDuration } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

type DurationFieldProps = {
  // In minutes.
  value: number;
  onChange: (minutes: number) => void;
  disabled?: boolean;
  /** The room of what holds it, which the row of chips crosses to its edges. */
  bleed?: number;
};

/**
 * How long a session lasted: the five usual lengths, a chip each, and a last one for another
 * length, which unfolds a line where it is set five minutes at a time, from a quarter of an hour
 * to eight hours. A length that is none of the usual ones is written on that last chip. The web's
 * `DurationInput` asks the same, its length of one's own in a drawer. Decision 043.
 */
export function DurationField({
  value,
  onChange,
  disabled = false,
  bleed = 0,
}: DurationFieldProps) {
  const { space } = useTheme();
  const isUsual = USUAL_LENGTHS.includes(value);
  // Whether the line of one's own length is open: always while the length is one's own.
  const [isOwn, setIsOwn] = useState(!isUsual);
  const shownOwn = isOwn || !isUsual;
  const step = (by: number) => {
    const next = withinLengths(value + by);
    if (next === value) return;
    feel("select");
    onChange(next);
  };

  return (
    <View style={{ gap: space.xs }}>
      <ChipRow label={m.session_duration()} bleed={bleed}>
        {USUAL_LENGTHS.map((minutes) => (
          <Chip
            key={minutes}
            label={formatDuration(minutes)}
            selected={!shownOwn && value === minutes}
            disabled={disabled}
            onPress={() => {
              setIsOwn(false);
              onChange(minutes);
            }}
          />
        ))}
        <Chip
          label={isUsual ? m.session_duration_other() : formatDuration(value)}
          selected={shownOwn}
          disabled={disabled}
          onPress={() => setIsOwn(true)}
        />
      </ChipRow>
      {shownOwn ? (
        <Animated.View
          entering={FadeIn}
          exiting={FadeOut}
          style={{ flexDirection: "row", alignItems: "center", gap: space.s }}
        >
          <IconButton
            icon={MinusIcon}
            label={m.session_duration_less()}
            disabled={disabled || value <= LEAST_MINUTES}
            onPress={() => step(-STEP_MINUTES)}
          />
          <View
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={m.session_duration()}
            accessibilityValue={{ text: formatDuration(value) }}
            accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
            onAccessibilityAction={(event) => {
              if (event.nativeEvent.actionName === "increment") step(STEP_MINUTES);
              if (event.nativeEvent.actionName === "decrement") step(-STEP_MINUTES);
            }}
            style={{ flex: 1, alignItems: "center" }}
          >
            <Text size="xl" weight="medium" numeric dense>
              {formatDuration(value)}
            </Text>
          </View>
          <IconButton
            icon={PlusIcon}
            label={m.session_duration_more()}
            disabled={disabled || value >= MOST_MINUTES}
            onPress={() => step(STEP_MINUTES)}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}
