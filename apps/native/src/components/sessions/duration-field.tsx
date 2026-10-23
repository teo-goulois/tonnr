import {
  LEAST_MINUTES,
  MOST_MINUTES,
  STEP_MINUTES,
  USUAL_LENGTHS,
  withinLengths,
} from "@repo/client/sessions/rules";
import { MinusIcon, PlusIcon } from "@repo/ui/icon";
import { useEffect, useState } from "react";
import { BackHandler, ScrollView, View } from "react-native";

import { Button, IconButton } from "@/components/ui/button";
import { MorphText } from "@/components/ui/morph-text";
import { Segmented } from "@/components/ui/segmented";
import { PanelHeader } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { formatDuration } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

// How long a session lasted, as the web's `DurationInput` asks it: the five usual lengths and a
// last choice for another, in one segment as wide as its line, and that last choice opening a step
// of the sheet, as the web opens a drawer, where a length of one's own is set five minutes at a
// time, from a quarter of an hour to eight hours, and kept once "Done" is pressed. A length that is
// none of the usual ones is written on that last choice. Decision 043, where Téo asked for both.

// The last choice, which is no length of its own.
const OWN = "own";

type DurationFieldProps = {
  // In minutes.
  value: number;
  onChange: (minutes: number) => void;
  /** Opens the step where a length of one's own is set. */
  onOwn: () => void;
  label: string;
  disabled?: boolean;
};

export function DurationField({
  value,
  onChange,
  onOwn,
  label,
  disabled = false,
}: DurationFieldProps) {
  const isUsual = USUAL_LENGTHS.includes(value);
  return (
    <Segmented<string>
      label={label}
      fill
      flush
      disabled={disabled}
      options={[
        ...USUAL_LENGTHS.map((minutes) => ({
          value: String(minutes),
          label: formatDuration(minutes),
        })),
        // The last choice becomes the length that was set, and its letters move to it.
        {
          value: OWN,
          label: isUsual ? m.session_duration_other() : formatDuration(value),
          morph: true,
        },
      ]}
      value={isUsual ? String(value) : OWN}
      // The last choice changes nothing by itself: its step does, once it is answered. Pressed
      // again, it opens its step again.
      onChange={(next) => (next === OWN ? onOwn() : onChange(Number(next)))}
      onReselect={(next) => {
        if (next === OWN) onOwn();
      }}
    />
  );
}

type DurationStepProps = {
  // The length the step opens on: the one the form holds.
  value: number;
  /** Keeps the length that was set. */
  onDone: (minutes: number) => void;
  /** Back to the form, the length left as it was, as the web's cross closes its drawer. */
  onClose: () => void;
};

/**
 * A length of one's own, as a step of the sheet: the length, whose figures move to what it
 * becomes, a slider between a button that takes five minutes away and one that adds them, and
 * "Done". Android's back goes back to the form, as the cross does.
 */
export function DurationStep({ value, onDone, onClose }: DurationStepProps) {
  const { space } = useTheme();
  const [own, setOwn] = useState(() => withinLengths(value));
  // A step from the length as it is then: two presses in a row are two steps.
  const step = (by: number) => setOwn((current) => withinLengths(current + by));

  useEffect(() => {
    const listener = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => listener.remove();
  }, [onClose]);

  return (
    <View style={{ flex: 1 }}>
      <PanelHeader title={m.session_duration()} onClose={onClose} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: space.l, padding: space.m }}>
        {/* The slider says the length to who cannot see it. Its figures slide as it moves. */}
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <MorphText size="xl" weight="medium" numeric align="center">
            {formatDuration(own)}
          </MorphText>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.s }}>
          <IconButton
            icon={MinusIcon}
            label={m.session_duration_less()}
            disabled={own <= LEAST_MINUTES}
            onPress={() => step(-STEP_MINUTES)}
          />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Slider
              label={m.session_duration()}
              value={own}
              min={LEAST_MINUTES}
              max={MOST_MINUTES}
              step={STEP_MINUTES}
              format={formatDuration}
              onChange={(next) => setOwn(withinLengths(next))}
            />
          </View>
          <IconButton
            icon={PlusIcon}
            label={m.session_duration_more()}
            disabled={own >= MOST_MINUTES}
            onPress={() => step(STEP_MINUTES)}
          />
        </View>
        <Button fill onPress={() => onDone(own)}>
          {m.session_duration_done()}
        </Button>
      </ScrollView>
    </View>
  );
}
