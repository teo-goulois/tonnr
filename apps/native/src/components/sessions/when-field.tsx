import { DatePicker, Host } from "@expo/ui/swift-ui";
import {
  datePickerStyle,
  disabled as disabledModifier,
  environment,
  labelsHidden,
  opacity,
  scaleEffect,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import type { ComponentRef, Ref } from "react";
import { View } from "react-native";

import { formatClock } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";

import { Pill } from "./pill";
import { dayWords, withClock, withDay } from "./session-logic";

// When a session began, as the web's form writes it: two pills, its day, "Today", "Yesterday" or
// its date, and its hour, each over the platform's own picker, as the web lays the device's control
// over its pill out of sight. On iOS SwiftUI's compact picker stands under each pill's face, which
// lets every touch through, grown past its edges, so that a press anywhere on the pill opens the
// system's calendar or its wheels over the sheet; a screen reader hears the pill, and its press
// lands in the middle of the picker. Android's dialogs are in `when-field.android.tsx`. Decision 043.

export type WhenFieldProps = {
  /** What a screen reader is moved to when the line is the form's first wrong one: the day. */
  ref?: Ref<ComponentRef<typeof View>>;
  value: Date;
  onChange: (moment: Date) => void;
  now: number;
  disabled?: boolean;
  /** What the line says to a screen reader: why the start is refused, once it is. */
  accessibilityHint?: string | undefined;
};

// Grown enough to cover a pill of a long word, whatever the length of the date iOS writes.
const GROWN = 2;
// Barely drawn, under the pill's face, which hides it: SwiftUI takes no press on what is wholly
// transparent.
const HIDDEN = 0.011;

function HiddenPicker({
  label,
  value,
  hourAndMinute,
  until,
  disabled,
  onChange,
}: {
  label: string;
  value: Date;
  hourAndMinute: boolean;
  until?: Date;
  disabled: boolean;
  onChange: (date: Date) => void;
}) {
  const { colors, scheme } = useTheme();
  return (
    <Host
      colorScheme={scheme}
      ignoreSafeArea="all"
      style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
    >
      <DatePicker
        title={label}
        selection={value}
        displayedComponents={hourAndMinute ? ["hourAndMinute"] : ["date"]}
        {...(until && { range: { end: until } })}
        onDateChange={onChange}
        modifiers={[
          datePickerStyle("compact"),
          labelsHidden(),
          tint(colors["color-1"]),
          environment("locale", getLocale()),
          disabledModifier(disabled),
          scaleEffect(GROWN),
          opacity(HIDDEN),
        ]}
      />
    </Host>
  );
}

export function WhenField({
  ref,
  value,
  onChange,
  now,
  disabled = false,
  accessibilityHint,
}: WhenFieldProps) {
  const { space } = useTheme();
  const day = dayWords(value, now);
  const clock = formatClock(value);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs, flexShrink: 1 }}>
      <Pill
        ref={ref}
        shown={day}
        disabled={disabled}
        accessibilityLabel={`${m.session_day()}, ${day}`}
        accessibilityHint={accessibilityHint}
      >
        <HiddenPicker
          label={m.session_day()}
          value={value}
          hourAndMinute={false}
          until={new Date(now)}
          disabled={disabled}
          onChange={(picked) => onChange(withDay(value, picked))}
        />
      </Pill>
      <Pill
        shown={clock}
        numeric
        disabled={disabled}
        accessibilityLabel={`${m.session_clock()}, ${clock}`}
        accessibilityHint={accessibilityHint}
      >
        <HiddenPicker
          label={m.session_clock()}
          value={value}
          hourAndMinute
          disabled={disabled}
          onChange={(picked) => onChange(withClock(value, picked))}
        />
      </Pill>
    </View>
  );
}
