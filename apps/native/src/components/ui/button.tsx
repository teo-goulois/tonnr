import { Button as HeroButton, Spinner } from "heroui-native";
import type { StyleProp, ViewStyle } from "react-native";

import { Glyph, type GlyphIcon } from "@/components/shared/glyph";
import { type TonnrTheme, useTheme } from "@/lib/theme";

import { edge } from "./edge";
import { ROUND, TARGET } from "./metrics";
import { Text } from "./text";

// The theme's button on HeroUI Native's, which keeps its press (a slight scale and a highlight)
// and its role. The shape is the web's, as decision 040 sizes it beside the bar of tabs: a
// button with a name has the theme's one height, the body's line and a step of room above and
// under it; a round one is 48 points. What is drawn in a color is drawn in the theme's.

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type Icon = GlyphIcon;

// HeroUI's press clips the button to its corners, so an edge is drawn inside it.
type Look = { background: string; label: string; edge?: string };

function lookOf(variant: ButtonVariant, disabled: boolean, colors: TonnrTheme["colors"]): Look {
  if (disabled) {
    return {
      background: variant === "ghost" ? "transparent" : colors["neutral-3"],
      label: colors["neutral-6"],
    };
  }
  switch (variant) {
    case "primary":
      return {
        background: colors["color-1"],
        label: colors["neutral-1"],
        edge: colors["cte-border"],
      };
    case "secondary":
      return {
        background: colors["neutral-3"],
        label: colors["neutral-10"],
        edge: colors["cte-border"],
      };
    case "ghost":
      return { background: "transparent", label: colors["neutral-10"] };
    case "danger":
      return {
        background: colors.error,
        label: colors["neutral-1"],
        edge: colors["cte-border"],
      };
  }
}

const HERO_VARIANT = {
  primary: "primary",
  secondary: "secondary",
  ghost: "ghost",
  danger: "danger",
} as const;

type ButtonProps = {
  /** What the button says, which is also what a screen reader says. */
  children: string;
  variant?: ButtonVariant;
  /** An icon before the name, from `@repo/ui/icon`. */
  icon?: Icon;
  onPress?: () => void;
  disabled?: boolean;
  /** Waiting for what the press began: a spinner takes the icon's place, and it cannot be pressed. */
  loading?: boolean;
  /** As wide as what holds it, whatever the way it aligns what it holds. */
  fill?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** A button with a name. */
export function Button({
  children,
  variant = "primary",
  icon,
  onPress,
  disabled = false,
  loading = false,
  fill = false,
  accessibilityHint,
  style,
  testID,
}: ButtonProps) {
  const { colors, space, type, radius } = useTheme();
  const look = lookOf(variant, disabled, colors);
  const height = type.m.line + 2 * space.xs;
  const slop = Math.ceil(Math.max(0, TARGET - height) / 2);

  return (
    <HeroButton
      variant={HERO_VARIANT[variant]}
      isDisabled={disabled || loading}
      onPress={onPress}
      accessibilityLabel={children}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      hitSlop={{ top: slop, bottom: slop }}
      testID={testID}
      style={[
        {
          height: "auto",
          minHeight: height,
          paddingHorizontal: space.m,
          paddingVertical: space.xs,
          gap: space.xs,
          borderRadius: radius.s,
          backgroundColor: look.background,
          // HeroUI fades what is disabled: the theme greys it instead, as the web does.
          opacity: 1,
          alignSelf: fill ? "stretch" : undefined,
        },
        look.edge ? edge(look.edge, { inset: true }) : null,
        style,
      ]}
    >
      {loading ? (
        <Spinner size="sm" color={look.label} />
      ) : icon ? (
        <Glyph icon={icon} size={16} color={look.label} />
      ) : null}
      <Text weight="medium" style={{ color: look.label }} numberOfLines={1}>
        {children}
      </Text>
    </HeroButton>
  );
}

type IconButtonProps = {
  icon: Icon;
  /** What a screen reader says of it: a round button has no name to read. */
  label: string;
  /**
   * The variants of `Button`, and `surface`: the theme's surface with its edge, as the map's
   * buttons float over it.
   */
  variant?: ButtonVariant | "surface";
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  /**
   * For a button that shows a state, whether it is on, which a screen reader says: what is drawn
   * says it too, with the filled icon, as a bookmark is filled while a list holds the place.
   */
  selected?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** A round button with an icon and no name. */
export function IconButton({
  icon,
  label,
  variant = "secondary",
  onPress,
  disabled = false,
  loading = false,
  selected,
  accessibilityHint,
  style,
  testID,
}: IconButtonProps) {
  const { colors } = useTheme();
  const look: Look =
    variant === "surface"
      ? disabled
        ? {
            background: colors["neutral-1"],
            label: colors["neutral-6"],
            edge: colors["neutral-10-transparent"],
          }
        : {
            background: colors["neutral-1"],
            label: colors["neutral-10"],
            edge: colors["neutral-10-transparent"],
          }
      : lookOf(variant, disabled, colors);

  return (
    <HeroButton
      variant={variant === "surface" ? "secondary" : HERO_VARIANT[variant]}
      isIconOnly
      isDisabled={disabled || loading}
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: disabled || loading, busy: loading, selected }}
      testID={testID}
      style={[
        {
          width: ROUND,
          height: ROUND,
          borderRadius: ROUND / 2,
          backgroundColor: look.background,
          opacity: 1,
        },
        look.edge ? edge(look.edge, { inset: true }) : null,
        style,
      ]}
    >
      {loading ? (
        <Spinner size="sm" color={look.label} />
      ) : (
        <Glyph icon={icon} size={20} color={look.label} />
      )}
    </HeroButton>
  );
}
