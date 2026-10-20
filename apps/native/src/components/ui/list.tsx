import { ChevronRightIcon } from "@repo/ui/icon";
import { Children, Fragment, isValidElement, type ReactNode } from "react";
import { Pressable, View } from "react-native";

import { Glyph, type GlyphIcon } from "@/components/shared/glyph";
import { useTheme } from "@/lib/theme";
import { light } from "@/theme/tokens";

import { feel } from "./haptics";
import { TARGET } from "./metrics";
import { Separator } from "./separator";
import { Surface } from "./surface";
import { Switch } from "./switch";
import { Text } from "./text";

// A list as the platform groups one, a Settings screen's: sections of rows on the theme's
// surface, each row a finger's height at least, with an icon on a tile, a title, a value, and a
// chevron or a switch at its end. The section's title is the web's (`AccountPanel`'s), and a
// line between two rows starts at the title, past the icon.

/** The tile an icon stands on, and its corner in the landing's `Tile` proportion. */
const TILE = 28;
const TILE_RADIUS = Math.round((TILE * 0.26) / 0.92);
const GLYPH = 16;

type Icon = GlyphIcon;

/**
 * The tile a row's icon stands on, for a row the kit's `Row` cannot draw, as one that holds a
 * field: on the theme's grey, or on a color, which makes its icon white.
 */
export function RowTile({
  icon,
  tint,
  disabled = false,
}: {
  icon: Icon;
  tint?: string | undefined;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: TILE,
        height: TILE,
        borderRadius: TILE_RADIUS,
        borderCurve: "continuous",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: tint ?? colors["neutral-3"],
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Glyph icon={icon} size={GLYPH} color={tint ? light["neutral-1"] : colors["neutral-10"]} />
    </View>
  );
}

type RowProps = {
  title: string;
  /** A line under the title. */
  description?: string;
  /** What the row is set to, at its end: a unit, a language. */
  value?: string;
  icon?: Icon;
  /** The tile's color, a color of the theme or of the sea's scales; its icon is then white. */
  tint?: string;
  /** Opens something: a chevron is drawn at the end, unless `chevron` is false. */
  onPress?: () => void;
  chevron?: boolean;
  /** A switch at the end, which the whole row is to a screen reader. */
  toggle?: { value: boolean; onChange: (value: boolean) => void };
  /** What cannot be undone: in the theme's red. */
  destructive?: boolean;
  disabled?: boolean;
  accessibilityHint?: string;
};

export function Row({
  title,
  description,
  value,
  icon,
  tint,
  onPress,
  chevron = true,
  toggle,
  destructive = false,
  disabled = false,
  accessibilityHint,
}: RowProps) {
  const { colors, space } = useTheme();
  const titleColor = disabled
    ? colors["neutral-6"]
    : destructive
      ? colors.error
      : colors["neutral-10"];

  const content = (
    <>
      {icon ? (
        <RowTile icon={icon} tint={destructive ? colors.error : tint} disabled={disabled} />
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={{ color: titleColor }}>{title}</Text>
        {description ? (
          <Text size="s" tone="muted">
            {description}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text tone="muted" numberOfLines={1} style={{ flexShrink: 1, textAlign: "right" }}>
          {value}
        </Text>
      ) : null}
      {toggle ? (
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Switch value={toggle.value} onChange={toggle.onChange} disabled={disabled} />
        </View>
      ) : onPress && chevron ? (
        <Glyph icon={ChevronRightIcon} size={GLYPH} color={colors["neutral-6"]} />
      ) : null}
    </>
  );

  const shape = {
    minHeight: TARGET,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: space.s,
    paddingHorizontal: space.m,
    paddingVertical: space.xs,
  };

  if (toggle) {
    // The switch takes its own touches; a screen reader reads the row as the switch, by its title.
    const flip = () => {
      if (disabled) return;
      feel(toggle.value ? "toggle-off" : "toggle-on");
      toggle.onChange(!toggle.value);
    };
    return (
      <View
        accessible
        accessibilityRole="switch"
        accessibilityLabel={description ? `${title}, ${description}` : title}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ checked: toggle.value, disabled }}
        accessibilityActions={[{ name: "activate" }]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === "activate") flip();
        }}
        style={shape}
      >
        {content}
      </View>
    );
  }

  if (!onPress) {
    return (
      <View accessible style={shape}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [shape, pressed ? { backgroundColor: colors["neutral-3"] } : null]}
    >
      {content}
    </Pressable>
  );
}

type SectionProps = {
  /** What the rows are about, over them. */
  title?: string;
  /** A line under the rows, that says what they do. */
  footer?: string;
  children: ReactNode;
};

/** Rows grouped on the theme's surface, a line between two of them. */
export function Section({ title, footer, children }: SectionProps) {
  const { space } = useTheme();
  const rows = Children.toArray(children).filter(isValidElement);

  return (
    <View style={{ gap: space.xs }}>
      {title ? (
        <Text
          size="s"
          weight="medium"
          tone="muted"
          accessibilityRole="header"
          style={{ paddingHorizontal: space.m }}
        >
          {title}
        </Text>
      ) : null}
      {/* It clips a pressed row to its corners, so its edge is drawn inside. */}
      <Surface insetEdge style={{ overflow: "hidden" }}>
        {rows.map((row, index) => {
          const hasIcon = (row.props as Partial<RowProps>).icon !== undefined;
          return (
            <Fragment key={row.key ?? index}>
              {index > 0 ? <Separator inset={space.m + (hasIcon ? TILE + space.s : 0)} /> : null}
              {row}
            </Fragment>
          );
        })}
      </Surface>
      {footer ? (
        <Text size="s" tone="muted" style={{ paddingHorizontal: space.m }}>
          {footer}
        </Text>
      ) : null}
    </View>
  );
}
