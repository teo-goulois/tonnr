import { SearchIcon, XIcon } from "@repo/ui/icon";
import { Spinner } from "heroui-native";
import { type ComponentRef, useRef, useState } from "react";
import { Platform, Pressable, TextInput, View } from "react-native";

import { Glyph } from "@/components/shared/glyph";
import { edge } from "@/components/ui/edge";
import { TARGET } from "@/components/ui/metrics";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

// A field that searches, as the platform draws one: a pill of the theme's muted ground with a
// magnifier, which takes the focus with its keyboard and offers the key that searches. It corrects
// no name: a phone's keyboard writes "guethary", which the search reads as Guéthary.
//
// `outlined` is the web's search inside a panel instead (`AutocompleteInput`, as the new spot's
// panel draws it): the kit's field, on the theme's surface inside a fine line of its fourth grey,
// with the web's focus ring, and the magnifier at its start, which turns into a spinner while the
// answer is on its way. While it cannot be typed in, it pales as the web's does.

type SearchFieldProps = {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder: string;
  // Takes the focus as it appears, so that the keyboard comes up with the sheet.
  autoFocus?: boolean;
  // While the answer is on its way: the magnifier pales, or turns into a spinner when outlined.
  pending?: boolean;
  // The platform's pill, or the web's field inside a panel.
  variant?: "filled" | "outlined";
  // Nothing can be typed in it: while what it was for is being saved.
  disabled?: boolean;
  onSubmit?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
};

export function SearchField({ variant = "filled", ...props }: SearchFieldProps) {
  return variant === "outlined" ? <OutlinedSearch {...props} /> : <FilledSearch {...props} />;
}

type VariantProps = Omit<SearchFieldProps, "variant">;

function FilledSearch({
  value,
  onChange,
  label,
  placeholder,
  autoFocus = false,
  pending = false,
  disabled = false,
  onSubmit,
  onFocus,
  onBlur,
}: VariantProps) {
  const { colors, space, type, fonts } = useTheme();
  return (
    <View
      style={{
        minHeight: TARGET,
        flexDirection: "row",
        alignItems: "center",
        gap: space.xs,
        paddingLeft: space.s,
        borderRadius: TARGET / 2,
        borderCurve: "continuous",
        backgroundColor: colors["neutral-3"],
      }}
    >
      <View style={{ opacity: pending ? 0.4 : 1 }}>
        <Glyph icon={SearchIcon} size={16} color={colors["neutral-7"]} />
      </View>
      <TextInput
        value={value}
        onChangeText={onChange}
        accessibilityLabel={label}
        placeholder={placeholder}
        placeholderTextColor={colors["neutral-6"]}
        autoFocus={autoFocus}
        editable={!disabled}
        returnKeyType="search"
        enterKeyHint="search"
        autoCorrect={false}
        autoCapitalize="none"
        autoComplete="off"
        spellCheck={false}
        // iOS draws its own button that clears the field; Android has the one below.
        clearButtonMode="while-editing"
        selectionColor={colors["color-1"]}
        onSubmitEditing={onSubmit}
        onFocus={onFocus}
        onBlur={onBlur}
        style={{
          flex: 1,
          minHeight: TARGET,
          paddingVertical: space.xs,
          paddingRight: Platform.OS === "ios" ? space.xs : 0,
          color: colors["neutral-10"],
          fontFamily: fonts.regular,
          // A field's text is as large as the platform's own, which keeps iOS from zooming.
          fontSize: Math.max(type.m.size, 16),
        }}
      />
      {Platform.OS !== "ios" && value.length > 0 && !disabled ? (
        <ClearButton onPress={() => onChange("")} />
      ) : null}
    </View>
  );
}

// The web's start addon: `size-4.5` on a phone, at its 80 % opacity, and its spinner `size-4`,
// ten points in from the edge, with what is typed starting 33 points in.
const START_ICON = 18;
const START_INSET = 10;
const TEXT_INSET = 33;

function OutlinedSearch({
  value,
  onChange,
  label,
  placeholder,
  autoFocus = false,
  pending = false,
  disabled = false,
  onSubmit,
  onFocus,
  onBlur,
}: VariantProps) {
  const { colors, space, type, fonts, radius } = useTheme();
  const [focused, setFocused] = useState(false);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  // The kit's field's height, the body's line and a step of room above and under it, which a
  // finger reaches all the same.
  const height = type.m.line + 2 * space.xs;
  const slop = Math.ceil(Math.max(0, TARGET - height) / 2);
  const line = disabled
    ? colors["neutral-4-transparent"]
    : focused
      ? colors["color-1-transparent"]
      : colors["neutral-4"];

  return (
    <Pressable
      accessible={false}
      disabled={disabled}
      hitSlop={{ top: slop, bottom: slop }}
      onPress={() => input.current?.focus()}
      style={[
        {
          minHeight: height,
          flexDirection: "row",
          alignItems: "center",
          gap: TEXT_INSET - START_INSET - START_ICON,
          paddingLeft: START_INSET,
          borderRadius: radius.s,
          borderCurve: "continuous",
          backgroundColor: disabled ? colors["neutral-3"] : colors["neutral-1"],
          opacity: disabled ? 0.64 : 1,
        },
        edge(line, { inset: true }),
        focused
          ? {
              outlineColor: colors["focus-ring"],
              outlineStyle: "solid",
              outlineWidth: 2,
              outlineOffset: 2,
            }
          : null,
      ]}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ width: START_ICON, alignItems: "center", opacity: 0.8 }}
      >
        {pending ? (
          <Spinner size="sm" color={colors["neutral-10"]} />
        ) : (
          <Glyph icon={SearchIcon} size={START_ICON} color={colors["neutral-10"]} />
        )}
      </View>
      <TextInput
        ref={input}
        value={value}
        onChangeText={onChange}
        accessibilityLabel={label}
        accessibilityState={{ disabled, busy: pending }}
        placeholder={placeholder}
        placeholderTextColor={colors["neutral-6"]}
        autoFocus={autoFocus}
        editable={!disabled}
        returnKeyType="search"
        enterKeyHint="search"
        autoCorrect={false}
        autoCapitalize="none"
        autoComplete="off"
        spellCheck={false}
        // iOS draws its own button that clears the field; Android has the one below.
        clearButtonMode="while-editing"
        selectionColor={colors["color-1"]}
        cursorColor={colors["color-1"]}
        onSubmitEditing={onSubmit}
        onFocus={() => {
          setFocused(true);
          onFocus?.();
        }}
        onBlur={() => {
          setFocused(false);
          onBlur?.();
        }}
        style={{
          flex: 1,
          minHeight: height,
          paddingVertical: space.xs,
          paddingRight: Platform.OS === "ios" ? space.xs : 0,
          color: disabled ? colors["neutral-6"] : colors["neutral-10"],
          fontFamily: fonts.regular,
          // A phone's field is written at 16 points, which the web gives it under `lg` too.
          fontSize: Math.max(type.m.size, 16),
        }}
      />
      {Platform.OS !== "ios" && value.length > 0 && !disabled ? (
        <ClearButton height={height} onPress={() => onChange("")} />
      ) : null}
    </Pressable>
  );
}

/**
 * What empties the field on Android, where the platform draws no such button: as tall as the
 * field, and a finger's height all the same.
 */
function ClearButton({ onPress, height = TARGET }: { onPress: () => void; height?: number }) {
  const { colors } = useTheme();
  const slop = Math.ceil(Math.max(0, TARGET - height) / 2);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={m.spot_search_clear()}
      onPress={onPress}
      hitSlop={{ top: slop, bottom: slop }}
      style={{
        width: TARGET,
        height,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Glyph icon={XIcon} size={16} color={colors["neutral-7"]} />
    </Pressable>
  );
}
