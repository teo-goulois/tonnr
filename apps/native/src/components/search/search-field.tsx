import { SearchIcon, XIcon } from "@repo/ui/icon";
import type { ComponentRef, Ref } from "react";
import { Platform, Pressable, TextInput, View } from "react-native";

import { Glyph } from "@/components/shared/glyph";
import { TARGET } from "@/components/ui/metrics";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

// A field that searches, as the platform draws one: a pill of the theme's muted ground with a
// magnifier, which takes the focus with its keyboard and offers the key that searches. It corrects
// no name: a phone's keyboard writes "guethary", which the search reads as Guéthary.

type SearchFieldProps = {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder: string;
  // Takes the focus as it appears, so that the keyboard comes up with the sheet.
  autoFocus?: boolean;
  // While the answer is on its way: the magnifier pales.
  pending?: boolean;
  onSubmit?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  disabled?: boolean;
  ref?: Ref<ComponentRef<typeof TextInput>>;
};

export function SearchField({
  value,
  onChange,
  label,
  placeholder,
  autoFocus = false,
  pending = false,
  onSubmit,
  onFocus,
  onBlur,
  disabled = false,
  ref,
}: SearchFieldProps) {
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
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <View style={{ opacity: pending ? 0.4 : 1 }}>
        <Glyph icon={SearchIcon} size={16} color={colors["neutral-7"]} />
      </View>
      <TextInput
        ref={ref}
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
      {Platform.OS !== "ios" && value.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={m.spot_search_clear()}
          onPress={() => onChange("")}
          style={{
            width: TARGET,
            height: TARGET,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Glyph icon={XIcon} size={16} color={colors["neutral-7"]} />
        </Pressable>
      ) : null}
    </View>
  );
}
