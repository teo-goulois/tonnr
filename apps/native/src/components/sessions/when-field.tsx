import DateTimePicker from "@expo/ui/community/datetime-picker";
import { getCalendars } from "expo-localization";
import { useState } from "react";
import { Platform, Pressable, View } from "react-native";

import { Text } from "@/components/ui/text";
import { formatClock } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";

import { dayWords, withClock, withDay } from "./session-logic";

// When a session began, on the platform's own pickers, as the web's two pills open the device's:
// on iOS the compact date and time pickers, which open their calendar and their wheels over the
// sheet; on Android two pills, each opening Material's dialog. Decision 043.

type WhenFieldProps = {
  value: Date;
  onChange: (moment: Date) => void;
  now: number;
  disabled?: boolean;
  /** Whether the moment is later than a session may be written: said beside it. */
  invalid?: boolean;
};

/** A value on a pill, which opens Android's dialog for it. */
function Pill({
  shown,
  label,
  onPress,
  disabled,
  invalid,
}: {
  shown: string;
  label: string;
  onPress: () => void;
  disabled: boolean;
  invalid: boolean;
}) {
  const { colors, space } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${shown}`}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={{ top: 6, bottom: 6 }}
      style={({ pressed }) => ({
        minHeight: 36,
        justifyContent: "center",
        paddingHorizontal: space.s,
        borderRadius: 999,
        backgroundColor: pressed ? colors["neutral-4"] : colors["neutral-3"],
      })}
    >
      <Text
        numeric
        dense
        style={{
          color: disabled ? colors["neutral-6"] : invalid ? colors.error : colors["neutral-10"],
        }}
      >
        {shown}
      </Text>
    </Pressable>
  );
}

export function WhenField({
  value,
  onChange,
  now,
  disabled = false,
  invalid = false,
}: WhenFieldProps) {
  const { colors, space, scheme } = useTheme();
  const today = new Date(now);
  // The picker that is open on Android, while it is.
  const [open, setOpen] = useState<"day" | "clock" | null>(null);

  if (Platform.OS === "ios") {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.xxs }}>
        <DateTimePicker
          value={value}
          mode="date"
          display="compact"
          maximumDate={today}
          locale={getLocale()}
          themeVariant={scheme}
          accentColor={colors["color-1"]}
          disabled={disabled}
          onValueChange={(_, day) => onChange(withDay(value, day))}
        />
        <DateTimePicker
          value={value}
          mode="time"
          display="compact"
          locale={getLocale()}
          themeVariant={scheme}
          accentColor={invalid ? colors.error : colors["color-1"]}
          disabled={disabled}
          onValueChange={(_, clock) => onChange(withClock(value, clock))}
        />
      </View>
    );
  }

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
      <Pill
        shown={dayWords(value, now)}
        label={m.session_day()}
        onPress={() => setOpen("day")}
        disabled={disabled}
        invalid={false}
      />
      <Pill
        shown={formatClock(value)}
        label={m.session_clock()}
        onPress={() => setOpen("clock")}
        disabled={disabled}
        invalid={invalid}
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
