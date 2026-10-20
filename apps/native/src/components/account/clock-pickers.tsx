import { DatePicker, Host } from "@expo/ui/swift-ui";
import { datePickerStyle, environment, labelsHidden, tint } from "@expo/ui/swift-ui/modifiers";

import { useTheme } from "@/lib/theme";
import { getLocale } from "@/paraglide/runtime";

import { dateOfDay, dateOfMinutes, dayOf, minutesOf } from "./alert-settings-words";

// A time of day and a day of the calendar, chosen with the platform's own pickers through Expo
// UI, at the end of a row: on iOS SwiftUI's compact picker, a pill that opens the system's wheel
// or calendar over the screen, whose label is said to a screen reader and not drawn, since the
// row says it; Android's are in `clock-pickers.android.tsx`. Each is read in the phone's own
// clock, and kept as the API takes it. Decision 069.

type PickerProps = {
  label: string;
  value: Date;
  hourAndMinute: boolean;
  from?: Date;
  onChange: (date: Date) => void;
};

function CompactPicker({ label, value, hourAndMinute, from, onChange }: PickerProps) {
  const { colors, scheme } = useTheme();
  return (
    // The compact picker hugs what it draws, and its host with it.
    <Host matchContents colorScheme={scheme} ignoreSafeArea="all">
      <DatePicker
        title={label}
        selection={value}
        displayedComponents={hourAndMinute ? ["hourAndMinute"] : ["date"]}
        {...(from && { range: { start: from } })}
        onDateChange={onChange}
        modifiers={[
          datePickerStyle("compact"),
          labelsHidden(),
          tint(colors["color-1"]),
          environment("locale", getLocale()),
        ]}
      />
    </Host>
  );
}

/** A time of day, in minutes since midnight. */
export function TimePicker({
  label,
  minutes,
  onChange,
}: {
  label: string;
  minutes: number;
  onChange: (minutes: number) => void;
}) {
  return (
    <CompactPicker
      label={label}
      value={dateOfMinutes(minutes)}
      hourAndMinute
      onChange={(date) => {
        const next = minutesOf(date);
        if (next !== minutes) onChange(next);
      }}
    />
  );
}

/** A day of the calendar, "2026-10-24", from `from` on. */
export function DayPicker({
  label,
  day,
  from,
  onChange,
}: {
  label: string;
  day: string;
  from: Date;
  onChange: (day: string) => void;
}) {
  return (
    <CompactPicker
      label={label}
      value={dateOfDay(day)}
      hourAndMinute={false}
      from={from}
      onChange={(date) => {
        const next = dayOf(date);
        if (next !== day) onChange(next);
      }}
    />
  );
}
