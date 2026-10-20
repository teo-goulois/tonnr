import { DatePicker, Host } from "@expo/ui/swift-ui";
import {
  datePickerStyle,
  disabled as disabledModifier,
  environment,
  labelsHidden,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { View } from "react-native";

import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";

import { withClock, withDay } from "./session-logic";

// When a session began, on the platform's own pickers, as the web's two pills open the device's:
// on iOS SwiftUI's compact pickers, a day and an hour, each a pill that opens the system's
// calendar or its wheels over the sheet, whose name is said to a screen reader and not drawn,
// since the row says it, as the account's pickers do (`clock-pickers.tsx`). Android's are in
// `when-field.android.tsx`. Decision 043.

export type WhenFieldProps = {
  value: Date;
  onChange: (moment: Date) => void;
  now: number;
  disabled?: boolean;
  /** Whether the moment is later than a session may be written: said beside it. */
  invalid?: boolean;
};

function CompactPicker({
  label,
  value,
  hourAndMinute,
  until,
  color,
  disabled,
  onChange,
}: {
  label: string;
  value: Date;
  hourAndMinute: boolean;
  until?: Date;
  color: string;
  disabled: boolean;
  onChange: (date: Date) => void;
}) {
  const { scheme } = useTheme();
  return (
    // The compact picker hugs what it draws, and its host with it.
    <Host matchContents colorScheme={scheme} ignoreSafeArea="all">
      <DatePicker
        title={label}
        selection={value}
        displayedComponents={hourAndMinute ? ["hourAndMinute"] : ["date"]}
        {...(until && { range: { end: until } })}
        onDateChange={onChange}
        modifiers={[
          datePickerStyle("compact"),
          labelsHidden(),
          tint(color),
          environment("locale", getLocale()),
          disabledModifier(disabled),
        ]}
      />
    </Host>
  );
}

export function WhenField({
  value,
  onChange,
  now,
  disabled = false,
  invalid = false,
}: WhenFieldProps) {
  const { colors, space } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.xxs }}>
      <CompactPicker
        label={m.session_day()}
        value={value}
        hourAndMinute={false}
        until={new Date(now)}
        color={colors["color-1"]}
        disabled={disabled}
        onChange={(day) => onChange(withDay(value, day))}
      />
      <CompactPicker
        label={m.session_clock()}
        value={value}
        hourAndMinute
        color={invalid ? colors.error : colors["color-1"]}
        disabled={disabled}
        onChange={(clock) => onChange(withClock(value, clock))}
      />
    </View>
  );
}
