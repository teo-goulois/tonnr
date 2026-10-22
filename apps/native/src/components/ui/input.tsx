import type { ComponentRef, ReactNode, Ref } from "react";
import { TextInput, type TextInputProps, View } from "react-native";

import { useTheme } from "@/lib/theme";

import { edge } from "./edge";
import { TARGET } from "./metrics";
import { Text } from "./text";

// A line of text typed in a panel, as the web's `Input` draws it on a phone: on the theme's
// surface inside a fine line of its fourth grey, at its smaller radius, which the line turns to
// the theme's red while what was typed is refused, and its third grey while it cannot be typed
// in. It is a finger's height, and grows with Dynamic Type. `Field` is the web's form field around
// it: its name over it in the body's medium, and what is wrong with it under it in the theme's
// red, which a screen reader is told of as it comes. What sends a form is never disabled to stop
// a wrong one: the field says what is wrong (decision 076).

type InputProps = Omit<TextInputProps, "style"> & {
  ref?: Ref<ComponentRef<typeof TextInput>>;
  /** What was typed is refused: its line is drawn in the theme's red. */
  invalid?: boolean;
  /** Read and copied, never typed in, as a link to share: drawn as a field that can be. */
  readOnly?: boolean;
};

export function Input({
  ref,
  invalid = false,
  readOnly = false,
  editable = true,
  ...props
}: InputProps) {
  const { colors, fonts, space, type, radius } = useTheme();
  const disabled = !editable && !readOnly;
  return (
    <View
      style={[
        {
          // As wide as what holds it, and in a line with a button, the room the button leaves.
          flexGrow: 1,
          flexShrink: 1,
          minHeight: TARGET,
          justifyContent: "center",
          borderRadius: radius.s,
          borderCurve: "continuous",
          backgroundColor: disabled ? colors["neutral-3"] : colors["neutral-1"],
        },
        edge(
          invalid ? colors.error : disabled ? colors["neutral-4-transparent"] : colors["neutral-4"],
          { inset: true },
        ),
      ]}
    >
      <TextInput
        ref={ref}
        editable={editable && !readOnly}
        readOnly={readOnly}
        selectTextOnFocus={readOnly}
        placeholderTextColor={colors["neutral-6"]}
        selectionColor={colors["color-1"]}
        cursorColor={colors["color-1"]}
        style={{
          minHeight: TARGET,
          paddingHorizontal: space.s,
          paddingVertical: space.xs,
          fontFamily: fonts.regular,
          fontSize: type.m.size,
          color: disabled ? colors["neutral-6"] : colors["neutral-10"],
        }}
        {...props}
      />
    </View>
  );
}

/**
 * A field of a form, the web's `field.Input` around what is typed: its name over it, and what is
 * wrong with it under it once it was sent. The control is given its own name for a screen reader.
 */
export function Field({
  label,
  error,
  children,
}: {
  label?: string;
  error?: string | undefined;
  children: ReactNode;
}) {
  const { space } = useTheme();
  return (
    <View style={{ gap: space.xs }}>
      {label ? (
        <Text
          weight="medium"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {label}
        </Text>
      ) : null}
      {children}
      {error ? (
        <Text size="s" tone="danger" accessibilityRole="alert" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
