import { Platform, Switch as NativeSwitch } from "react-native";

import { useTheme } from "@/lib/theme";

import { feel } from "./haptics";

// The platform's own switch, in the theme's colors: on, the accent's track, as the web's is;
// off, the edge's grey. iOS keeps its white thumb and plays its own touch as it turns; Android
// takes the theme's surface for its thumb, and is given the touch.

type SwitchProps = {
  value: boolean;
  onChange: (value: boolean) => void;
  /** What a screen reader says of it, when no row around it names it. */
  label?: string;
  disabled?: boolean;
  testID?: string;
};

export function Switch({ value, onChange, label, disabled = false, testID }: SwitchProps) {
  const { colors } = useTheme();
  return (
    <NativeSwitch
      value={value}
      onValueChange={(next) => {
        if (Platform.OS === "android") feel(next ? "toggle-on" : "toggle-off");
        onChange(next);
      }}
      disabled={disabled}
      accessibilityLabel={label}
      testID={testID}
      trackColor={{ false: colors["neutral-4"], true: colors["color-1"] }}
      ios_backgroundColor={colors["neutral-4"]}
      thumbColor={Platform.OS === "android" ? colors["neutral-1"] : undefined}
    />
  );
}
