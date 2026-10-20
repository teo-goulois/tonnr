import type { ComponentRef, Ref } from "react";
import { TextInput, type TextInputProps } from "react-native";

import { TARGET } from "@/components/ui/metrics";
import { useTheme } from "@/lib/theme";

/**
 * A line of text typed in a grouped row, in the theme's type and colors: the name of a list, a
 * password. It grows with Dynamic Type, and is a finger's height at least. The keyboard keeps
 * clear of it through the screen's `KeyboardAwareScrollView`.
 */
export function TextField({
  ref,
  style,
  editable = true,
  ...props
}: TextInputProps & { ref?: Ref<ComponentRef<typeof TextInput>> }) {
  const { colors, fonts, type } = useTheme();
  return (
    <TextInput
      ref={ref}
      editable={editable}
      placeholderTextColor={colors["neutral-6"]}
      selectionColor={colors["color-1"]}
      cursorColor={colors["color-1"]}
      style={[
        {
          flex: 1,
          minHeight: TARGET,
          fontFamily: fonts.regular,
          fontSize: type.m.size,
          color: editable ? colors["neutral-10"] : colors["neutral-6"],
          paddingVertical: 0,
        },
        style,
      ]}
      {...props}
    />
  );
}
