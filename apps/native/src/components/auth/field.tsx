import { type Ref, useState } from "react";
import { TextInput, type TextInputInstance, type TextInputProps, View } from "react-native";

import { edge } from "@/components/ui/edge";
import { TARGET } from "@/components/ui/metrics";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/lib/theme";

// A field of a form, as the web's `Input` draws it: the theme's surface in a pill with its edge,
// which takes the accent's while it is written in and the theme's red while what it holds is
// wrong, its name over it and, under it, what is wrong with it or what it says of itself. Its
// text is the body's, which Dynamic Type grows, and it is a finger's height at least.

export type FieldProps = Omit<TextInputProps, "style" | "editable"> & {
  /** What the field holds, over it, and what a screen reader names it. */
  label: string;
  /** What the field says of itself while nothing is wrong with it. */
  hint?: string | undefined;
  /** What is wrong with what it holds. */
  error?: string | undefined;
  disabled?: boolean;
  ref?: Ref<TextInputInstance>;
};

export function Field({ label, hint, error, disabled = false, ref, ...input }: FieldProps) {
  const { colors, space, type, radius, fonts, border } = useTheme();
  const [focused, setFocused] = useState(false);
  const said = error ?? hint;
  const edgeColor = error ? colors.error : focused ? colors["color-1"] : colors["neutral-4"];

  return (
    <View style={{ gap: space.xxs }}>
      <Text size="s" weight="medium" tone="muted" accessible={false}>
        {label}
      </Text>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        accessibilityHint={said}
        accessibilityState={{ disabled }}
        aria-invalid={error ? true : undefined}
        editable={!disabled}
        placeholderTextColor={colors["neutral-6"]}
        selectionColor={colors["color-1"]}
        cursorColor={colors["color-1"]}
        {...input}
        onFocus={(event) => {
          setFocused(true);
          input.onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          input.onBlur?.(event);
        }}
        style={[
          {
            minHeight: TARGET,
            paddingHorizontal: space.s,
            paddingVertical: space.xs,
            borderRadius: radius.s,
            borderCurve: "continuous",
            backgroundColor: disabled ? colors["neutral-3"] : colors["neutral-1"],
            color: disabled ? colors["neutral-6"] : colors["neutral-10"],
            fontFamily: fonts.regular,
            // A phone's field is written at 16 points, which the web gives it under `lg` too.
            fontSize: Math.max(type.m.size, 16),
          },
          edge(edgeColor, { inset: true, width: error || focused ? border.m : border.s }),
        ]}
      />
      {said ? (
        <Text
          size="s"
          tone={error ? "danger" : "muted"}
          accessibilityLiveRegion={error ? "polite" : "none"}
          accessibilityRole={error ? "alert" : undefined}
        >
          {said}
        </Text>
      ) : null}
    </View>
  );
}
