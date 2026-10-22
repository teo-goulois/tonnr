import { ChevronRightIcon } from "@repo/ui/icon";
import {
  Children,
  createContext,
  Fragment,
  isValidElement,
  type ReactNode,
  useContext,
} from "react";
import { Pressable, View } from "react-native";

import { Glyph, type GlyphIcon } from "@/components/shared/glyph";
import { useTheme } from "@/lib/theme";
import { light } from "@/theme/tokens";

import { Badge } from "./badge";
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
//
// A `plain` section is the web's panel instead, as a tab of the phone's bar draws one
// (`AccountPanel`, `AlertSettings`): its title over rows that stand on the screen's own ground,
// with no surface and no line between them, each row's words in line with the title, and a
// press tinted in the theme's transparent third grey. Its rows read it from the section.

/** The tile an icon stands on, and its corner in the landing's `Tile` proportion. */
const TILE = 28;
const TILE_RADIUS = Math.round((TILE * 0.26) / 0.92);
const GLYPH = 16;

type Icon = GlyphIcon;

/** Whether the rows stand in a plain section, the web's panel. */
const Plain = createContext(false);

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
  /** A short word beside the title, on the theme's grey: the web's neutral `Badge`. */
  badge?: string;
  /** A line under the title. */
  description?: string;
  /** A line under the description, in the theme's red, that a screen reader is told of. */
  note?: string;
  /** What the row is set to, at its end: a unit, a language. */
  value?: string;
  icon?: Icon;
  /** The tile's color, a color of the theme or of the sea's scales; its icon is then white. */
  tint?: string;
  /** Opens something: a chevron is drawn at the end, unless `chevron` is false. */
  onPress?: () => void;
  chevron?: boolean;
  /**
   * A switch at the end, which the whole row is to a screen reader. `disabled` holds the switch
   * alone still, while what it began is under way, and leaves the row's words as they are.
   */
  toggle?: { value: boolean; onChange: (value: boolean) => void; disabled?: boolean };
  /** What stands at the row's end in place of a chevron: a button of its own. */
  accessory?: ReactNode;
  /** What cannot be undone: in the theme's red. */
  destructive?: boolean;
  disabled?: boolean;
  accessibilityHint?: string;
};

export function Row({
  title,
  badge,
  description,
  note,
  value,
  icon,
  tint,
  onPress,
  chevron = true,
  toggle,
  accessory,
  destructive = false,
  disabled = false,
  accessibilityHint,
}: RowProps) {
  const { colors, space, radius } = useTheme();
  const plain = useContext(Plain);
  const titleColor = disabled
    ? plain
      ? colors["neutral-7"]
      : colors["neutral-6"]
    : destructive
      ? colors.error
      : colors["neutral-10"];
  const switchDisabled = disabled || toggle?.disabled === true;

  // What the row says, which a screen reader reads as one element, and what stands at its end.
  const spoken = [title, badge, description, note, value].filter(Boolean).join(", ");
  const words = (
    <>
      {icon ? (
        <RowTile icon={icon} tint={destructive ? colors.error : tint} disabled={disabled} />
      ) : null}
      <View style={{ flex: 1, gap: plain ? space.xxs : 0 }}>
        {badge ? (
          <View
            style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.xs }}
          >
            <Text style={{ color: titleColor, flexShrink: 1 }}>{title}</Text>
            <Badge>{badge}</Badge>
          </View>
        ) : (
          <Text style={{ color: titleColor }}>{title}</Text>
        )}
        {description ? (
          <Text size="s" tone="muted">
            {description}
          </Text>
        ) : null}
        {note ? (
          <Text size="s" tone="danger" accessibilityLiveRegion="polite">
            {note}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text tone="muted" numberOfLines={1} style={{ flexShrink: 1, textAlign: "right" }}>
          {value}
        </Text>
      ) : null}
    </>
  );
  const content = (
    <>
      {words}
      {toggle ? (
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Switch value={toggle.value} onChange={toggle.onChange} disabled={switchDisabled} />
        </View>
      ) : onPress && chevron ? (
        <Glyph
          icon={ChevronRightIcon}
          size={GLYPH}
          color={plain ? colors["neutral-7"] : colors["neutral-6"]}
        />
      ) : null}
    </>
  );

  // A plain row's words stand in line with its section's title: its room is laid outside it, as
  // the web's `-mx-xs px-xs`, so that only its press shows it. A switch beside two lines stands
  // at their top, as the web's settings have it.
  const shape = plain
    ? {
        minHeight: TARGET,
        flexDirection: "row" as const,
        alignItems: toggle && (description || note) ? ("flex-start" as const) : ("center" as const),
        gap: space.s,
        marginHorizontal: -space.xs,
        paddingHorizontal: space.xs,
        borderRadius: radius.xs,
        borderCurve: "continuous" as const,
      }
    : {
        minHeight: TARGET,
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: space.s,
        paddingHorizontal: space.m,
        paddingVertical: space.xs,
      };
  const pressedGround = plain ? colors["neutral-3-transparent"] : colors["neutral-3"];

  if (toggle) {
    // The switch takes its own touches; a screen reader reads the row as the switch, by its title.
    const flip = () => {
      if (switchDisabled) return;
      feel(toggle.value ? "toggle-off" : "toggle-on");
      toggle.onChange(!toggle.value);
    };
    return (
      <View
        accessible
        accessibilityRole="switch"
        // Its red line is read with its words: what failed is said where the switch is.
        accessibilityLabel={[title, description, note].filter(Boolean).join(", ")}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ checked: toggle.value, disabled: switchDisabled }}
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

  if (accessory !== undefined) {
    // A button at its end is an element of its own, after the row's words, which are one: a row
    // read as one element would hide the button from a screen reader, which could neither reach
    // nor press it. A row that opens something opens it from its words.
    const wordsShape = {
      flex: 1,
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: space.s,
      alignSelf: "stretch" as const,
    };
    return (
      <View style={shape}>
        {onPress ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={spoken}
            accessibilityHint={accessibilityHint}
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={onPress}
            style={({ pressed }) => [
              wordsShape,
              pressed ? { backgroundColor: pressedGround, borderRadius: radius.xs } : null,
            ]}
          >
            {words}
          </Pressable>
        ) : (
          <View accessible accessibilityLabel={spoken} style={wordsShape}>
            {words}
          </View>
        )}
        {accessory}
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
      style={({ pressed }) => [shape, pressed ? { backgroundColor: pressedGround } : null]}
    >
      {content}
    </Pressable>
  );
}

type SectionProps = {
  /** What the rows are about, over them. */
  title?: string;
  /** A line over the rows, under the title, that says what they are: a plain section's. */
  lead?: string;
  /** A line under the rows, that says what they do. */
  footer?: string;
  /** The web's panel: rows on the screen's ground, with no surface and no line between them. */
  plain?: boolean;
  children: ReactNode;
};

/** Rows grouped on the theme's surface, a line between two of them; or, plain, the web's. */
export function Section({ title, lead, footer, plain = false, children }: SectionProps) {
  const { space } = useTheme();
  const rows = Children.toArray(children).filter(isValidElement);

  if (plain) {
    return (
      <Plain.Provider value>
        <View style={{ gap: space.s }}>
          {title ? (
            <Text size="s" weight="medium" tone="muted" accessibilityRole="header">
              {title}
            </Text>
          ) : null}
          {lead ? (
            <Text size="s" tone="muted">
              {lead}
            </Text>
          ) : null}
          {rows}
          {footer ? (
            <Text size="s" tone="muted">
              {footer}
            </Text>
          ) : null}
        </View>
      </Plain.Provider>
    );
  }

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

/**
 * A setting on a line, as the web's `Line` in `AccountPanel`: its name, and what chooses it at
 * the line's end, which goes under the name when the line is too narrow for both.
 */
export function SettingLine({ label, children }: { label: string; children: ReactNode }) {
  const { space } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
        columnGap: space.s,
        rowGap: space.xxs,
        minHeight: TARGET,
      }}
    >
      <Text>{label}</Text>
      {children}
    </View>
  );
}
