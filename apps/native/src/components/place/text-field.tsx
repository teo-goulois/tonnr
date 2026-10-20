import { TextInput, type TextInputProps } from "react-native";

import { useTheme } from "@/lib/theme";

// A field of the place's sheets, as the web's `Input` draws one under `lg`: the theme's surface
// and edge, its text at 16 points, a finger's height at least, and its name said to a screen
// reader, which the placeholder repeats.

export function TextField({
  label,
  multiline = false,
  style,
  ...props
}: Omit<TextInputProps, "accessibilityLabel"> & { label: string }) {
  const { colors, space, radius, fonts } = useTheme();
  return (
    <TextInput
      accessibilityLabel={label}
      placeholder={props.placeholder ?? label}
      placeholderTextColor={colors["neutral-6"]}
      selectionColor={colors["color-1"]}
      multiline={multiline}
      textAlignVertical={multiline ? "top" : "center"}
      style={[
        {
          minHeight: multiline ? 88 : 44,
          paddingHorizontal: space.s,
          paddingVertical: space.xs,
          borderRadius: multiline ? radius.xs : radius.s,
          borderCurve: "continuous",
          borderWidth: 1,
          borderColor: colors["neutral-4"],
          backgroundColor: colors["neutral-1"],
          color: colors["neutral-10"],
          fontFamily: fonts.regular,
          fontSize: 16,
        },
        style,
      ]}
      {...props}
    />
  );
}
