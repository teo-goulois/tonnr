import { DateTimePicker } from "@expo/ui/community/datetime-picker";
import { getCalendars } from "expo-localization";
import { useState } from "react";
import { Pressable } from "react-native";

import { TARGET } from "@/components/ui/metrics";
import { Text } from "@/components/ui/text";
import { formatClock } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { getLocale } from "@/paraglide/runtime";

import { dateOfDay, dateOfMinutes, dayOf, minutesOf } from "./alert-settings-words";

// A time of day and a day of the calendar, chosen with the platform's own pickers through Expo
// UI, at the end of a row: on Android the value as a button that opens Material's dialog, which
// stands while it is open. iOS's are in `clock-pickers.tsx`. Each is read in the phone's own
// clock, and kept as the API takes it. Decision 069.

/** The value at the end of a row, in the accent's color, which opens its dialog. */
function DialogValue({
  label,
  shown,
  onPress,
}: {
  label: string;
  shown: string;
  onPress: () => void;
}) {
  const { colors, space, radius } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${shown}`}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: TARGET,
        justifyContent: "center",
        paddingHorizontal: space.s,
        borderRadius: radius.xs,
        backgroundColor: pressed ? colors["neutral-4"] : colors["neutral-3"],
      })}
    >
      <Text numeric dense style={{ color: colors["color-1"] }}>
        {shown}
      </Text>
    </Pressable>
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
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <>
      <DialogValue
        label={label}
        shown={formatClock(dateOfMinutes(minutes))}
        onPress={() => setOpen(true)}
      />
      {open ? (
        <DateTimePicker
          value={dateOfMinutes(minutes)}
          mode="time"
          is24Hour={getCalendars()[0]?.uses24hourClock ?? true}
          accentColor={colors["color-1"]}
          onValueChange={(_event, date) => {
            setOpen(false);
            onChange(minutesOf(date));
          }}
          onDismiss={() => setOpen(false)}
        />
      ) : null}
    </>
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
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const value = dateOfDay(day);
  const shown = new Intl.DateTimeFormat(getLocale(), { dateStyle: "medium" }).format(value);

  return (
    <>
      <DialogValue label={label} shown={shown} onPress={() => setOpen(true)} />
      {open ? (
        <DateTimePicker
          value={value}
          mode="date"
          minimumDate={from}
          accentColor={colors["color-1"]}
          onValueChange={(_event, date) => {
            setOpen(false);
            onChange(dayOf(date));
          }}
          onDismiss={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
