import { DateTimePicker } from "@expo/ui/community/datetime-picker";
import { getCalendars } from "expo-localization";
import { useState } from "react";
import { View } from "react-native";

import { formatClock } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

import { Pill } from "./pill";
import { dayWords, withClock, withDay } from "./session-logic";
import type { WhenFieldProps } from "./when-field";

// When a session began, as the web's form writes it: two pills, its day, "Today", "Yesterday" or
// its date, and its hour, each opening Material's dialog, which stands while it is open, as the
// web's pill opens the device's control. iOS's are in `when-field.tsx`. Decision 043.

export function WhenField({
  ref,
  value,
  onChange,
  now,
  disabled = false,
  accessibilityHint,
}: WhenFieldProps) {
  const { colors, space } = useTheme();
  const today = new Date(now);
  // The picker that is open, while it is.
  const [open, setOpen] = useState<"day" | "clock" | null>(null);
  const day = dayWords(value, now);
  const clock = formatClock(value);

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs, flexShrink: 1 }}>
      <Pill
        ref={ref}
        shown={day}
        disabled={disabled}
        onPress={() => setOpen("day")}
        accessibilityLabel={`${m.session_day()}, ${day}`}
        accessibilityHint={accessibilityHint}
      />
      <Pill
        shown={clock}
        numeric
        disabled={disabled}
        onPress={() => setOpen("clock")}
        accessibilityLabel={`${m.session_clock()}, ${clock}`}
        accessibilityHint={accessibilityHint}
      />
      {open ? (
        <DateTimePicker
          value={value}
          mode={open === "day" ? "date" : "time"}
          presentation="dialog"
          maximumDate={open === "day" ? today : undefined}
          is24Hour={getCalendars()[0]?.uses24hourClock ?? true}
          accentColor={colors["color-1"]}
          onValueChange={(_, picked) => {
            setOpen(null);
            onChange(open === "day" ? withDay(value, picked) : withClock(value, picked));
          }}
          onDismiss={() => setOpen(null)}
        />
      ) : null}
    </View>
  );
}
