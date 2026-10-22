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

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
type Icon = GlyphIcon;

// HeroUI's press clips the button to its corners, so an edge is drawn inside it.
type Look = { background: string; label: string; edge?: string };

function lookOf(variant: ButtonVariant, disabled: boolean, colors: TonnrTheme["colors"]): Look {
  if (disabled) {
    if (variant === "outline") {
      return {
        background: "transparent",
        label: colors["neutral-6"],
        edge: colors["neutral-4-transparent"],
      };
    }
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
    // The web's: no ground, a line of the theme's fourth grey inside it.
    case "outline":
      return { background: "transparent", label: colors["neutral-10"], edge: colors["neutral-4"] };
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
      // HeroUI's outline draws a border of its own: the theme's edge is drawn below instead.
      variant={variant === "outline" ? "ghost" : variant}
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
   * buttons float over it, and `inverse`, the theme's ink with no edge, as a map's button is
   * filled while what it shows is narrowed (a list shown alone).
   */
  variant?: ButtonVariant | "surface" | "inverse";
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  /**
   * For a button that shows a state, whether it is on, which a screen reader says: what is drawn
   * says it too, with the filled icon, as a bookmark is filled while a list holds the place.
   */
  selected?: boolean;
  /**
   * For a button that unfolds something beside it, whether it is unfolded, which a screen reader
   * says: a surface button is then drawn pressed, in the theme's third grey, as the web's is.
   */
  expanded?: boolean;
  /**
   * `small` is the web's `icon-sm` under `lg`, 40 points with a 16-point icon, for a button that
   * stands in a line of text, as a list's share and trash do: its target still reaches a finger's.
   */
  size?: "default" | "small";
  /** The icon's color, where it says a state: a list that is shared, in the theme's accent. */
  iconColor?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const SMALL = 40;

/** A round button with an icon and no name. */
export function IconButton({
  icon,
  label,
  variant = "secondary",
  onPress,
  disabled = false,
  loading = false,
  selected,
  expanded,
  size = "default",
  iconColor,
  accessibilityHint,
  style,
  testID,
}: IconButtonProps) {
  const diameter = size === "small" ? SMALL : ROUND;
  const slop = Math.ceil(Math.max(0, TARGET - diameter) / 2);
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
            background: expanded ? colors["neutral-3"] : colors["neutral-1"],
            label: colors["neutral-10"],
            edge: colors["neutral-10-transparent"],
          }
      : variant === "inverse"
        ? disabled
          ? { background: colors["neutral-3"], label: colors["neutral-6"] }
          : { background: colors["neutral-10"], label: colors["neutral-1"] }
        : lookOf(variant, disabled, colors);

  return (
    <HeroButton
      variant={
        variant === "surface"
          ? "secondary"
          : variant === "inverse"
            ? "primary"
            : variant === "outline"
              ? "ghost"
              : variant
      }
      isIconOnly
      isDisabled={disabled || loading}
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: disabled || loading, busy: loading, selected, expanded }}
      hitSlop={slop}
      testID={testID}
      style={[
        {
          width: diameter,
          height: diameter,
          borderRadius: diameter / 2,
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
        <Glyph
          icon={icon}
          size={size === "small" ? 16 : 20}
          color={disabled ? look.label : (iconColor ?? look.label)}
        />
      )}
    </HeroButton>
  );
}
