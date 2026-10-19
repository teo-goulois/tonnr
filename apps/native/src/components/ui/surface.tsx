import type { ReactNode } from "react";
import { Pressable, type StyleProp, View, type ViewProps, type ViewStyle } from "react-native";

import { type TonnrTheme, useTheme } from "@/lib/theme";

import { edge } from "./edge";
import { Text } from "./text";

// The grounds of the theme, each with its edge, a fine line of the theme's grey and no shadow:
// the theme's shadows are transparent, so nothing stands higher than another but by its ground.
//   - `raised`, the surface that floats, as a menu, a sheet or the map's buttons have it;
//   - `default`, the surface of a card in a panel;
//   - `muted`, a ground with no edge, under what is grouped.

export type SurfaceVariant = "raised" | "default" | "muted";
export type SurfaceRadius = "xs" | "s" | "m";

function groundOf(variant: SurfaceVariant, colors: TonnrTheme["colors"], inset = false) {
  switch (variant) {
    case "raised":
      return { backgroundColor: colors["neutral-1"], ...edge(colors["neutral-4"], { inset }) };
    case "default":
      return { backgroundColor: colors["cte-surface"], ...edge(colors["neutral-4"], { inset }) };
    case "muted":
      return { backgroundColor: colors["neutral-3"] };
  }
}

type SurfaceProps = ViewProps & {
  variant?: SurfaceVariant;
  /** A step of the theme's radii: `xs`, the one a panel's parts take, by default. */
  radius?: SurfaceRadius;
  /**
   * The edge drawn inside: for a surface that clips what it holds, since a line drawn outside
   * would be clipped with it.
   */
  insetEdge?: boolean;
};

export function Surface({
  variant = "default",
  radius = "xs",
  insetEdge = false,
  style,
  ...props
}: SurfaceProps) {
  const theme = useTheme();
  return (
    <View
      style={[
        groundOf(variant, theme.colors, insetEdge),
        { borderRadius: theme.radius[radius], borderCurve: "continuous" },
        style,
      ]}
      {...props}
    />
  );
}

type CardProps = {
  title?: string;
  description?: string;
  children?: ReactNode;
  variant?: SurfaceVariant;
  /** A card that opens something: the whole card is one button, named by its title. */
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
};

/** A surface with room inside, and a title and a line over what it holds. */
export function Card({
  title,
  description,
  children,
  variant = "default",
  onPress,
  accessibilityLabel,
  accessibilityHint,
  style,
}: CardProps) {
  const theme = useTheme();
  const body = (
    <>
      {title ? (
        <Text weight="medium" accessibilityRole={onPress ? undefined : "header"}>
          {title}
        </Text>
      ) : null}
      {description ? (
        <Text size="s" tone="muted">
          {description}
        </Text>
      ) : null}
      {children}
    </>
  );
  const shape: ViewStyle = {
    gap: theme.space.xs,
    padding: theme.space.m,
    borderRadius: theme.radius.xs,
    borderCurve: "continuous",
  };

  if (!onPress) {
    return <View style={[groundOf(variant, theme.colors), shape, style]}>{body}</View>;
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      style={({ pressed }) => [
        groundOf(variant, theme.colors),
        shape,
        pressed ? { backgroundColor: theme.colors["neutral-3"] } : null,
        style,
      ]}
    >
      {body}
    </Pressable>
  );
}
