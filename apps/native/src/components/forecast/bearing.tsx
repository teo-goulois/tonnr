import { ArrowUpIcon } from "@repo/ui/icon";
import { View, useWindowDimensions } from "react-native";
import Svg, { Line } from "react-native-svg";

import { goingTo } from "@/components/map/features";
import { Glyph } from "@/components/shared/glyph";
import { DENSE_SCALE, Text, type TextProps } from "@/components/ui/text";
import { compassName, compassPoint, formatNumber } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

// How a direction is written everywhere, as the web's `Bearing` writes it: an arrow that points
// the way the wind or the swell goes, then the name of the point it comes from. Never a name
// alone: the arrow has turned it into a direction.

// The arrow's line, as the web draws it everywhere, bolder than the icon's own.
const ARROW_STROKE = 2.25;
// The arrow beside a name is the size of the name's letters: 0.85 of its type, as the web's 0.85em.
const ARROW_EM = 0.85;

/**
 * An arrow that points the way something goes, from the bearing it comes from: on a line of its
 * own, or in a line of text, at the text's size.
 */
export function DirectionArrow({
  fromDegrees,
  size = 14,
  color,
}: {
  fromDegrees: number;
  size?: number;
  color?: string;
}) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size, transform: [{ rotate: `${goingTo(fromDegrees)}deg` }] }}
    >
      <Glyph icon={ArrowUpIcon} size={size} color={color} strokeWidth={ARROW_STROKE} />
    </View>
  );
}

type BearingProps = Omit<TextProps, "children"> & {
  // Clockwise from north, where it comes from.
  degrees: number;
  // Writes the figure after the name, as "S 190°".
  withDegrees?: boolean;
  // Writes the point by its full name, "west-northwest", where there is room for words.
  named?: boolean;
  // The arrow's size: the size of the text's letters by default.
  arrow?: number;
  color?: string;
};

/**
 * Where a wind or a swell comes from, as a line of its own: the arrow, then the name. A screen
 * reader hears the full name of the point, which says the same as the arrow.
 */
export function Bearing({
  degrees,
  withDegrees = false,
  named = false,
  arrow,
  color,
  size = "s",
  ...text
}: BearingProps) {
  const { colors, space, type } = useTheme();
  // The arrow grows with the letters beside it, as far as the reader's type takes them.
  const { fontScale } = useWindowDimensions();
  const grown = Math.min(
    fontScale,
    text.maxFontSizeMultiplier ?? (text.dense ? DENSE_SCALE : fontScale),
  );
  const name = named ? compassName(degrees) : compassPoint(degrees);
  return (
    <View
      accessible
      accessibilityLabel={`${m.alert_from()} ${compassName(degrees)}${withDegrees ? `, ${formatNumber(degrees, 0)}°` : ""}`}
      // Narrower than its name, as a tile is in the largest type, it ends in an ellipsis, as the
      // web's does, rather than running past what holds it.
      style={{ flexDirection: "row", alignItems: "center", gap: space.xxs, flexShrink: 1 }}
    >
      <DirectionArrow
        fromDegrees={degrees}
        size={arrow ?? Math.round(type[size].size * ARROW_EM * grown)}
        color={color ?? colors["neutral-10"]}
      />
      <Text
        size={size}
        numberOfLines={1}
        style={[{ flexShrink: 1 }, color ? { color } : null]}
        {...text}
      >
        {name}
        {withDegrees ? ` ${formatNumber(degrees, 0)}°` : ""}
      </Text>
    </View>
  );
}

/**
 * A line as a chart draws it, before the figure it tells apart: the buoy's bold one, the model's
 * dashed one, or the thin one of the gusts.
 */
export function LineGlyph({
  dashed = false,
  thin = false,
  color,
}: {
  dashed?: boolean;
  thin?: boolean;
  color?: string;
}) {
  const { colors } = useTheme();
  return (
    <Svg width={14} height={6} accessibilityElementsHidden importantForAccessibility="no">
      <Line
        x1={1}
        x2={13}
        y1={3}
        y2={3}
        stroke={color ?? colors["neutral-8"]}
        strokeLinecap="round"
        strokeWidth={dashed ? 1.5 : thin ? 1.25 : 2.5}
        strokeDasharray={dashed ? "3 3" : undefined}
      />
    </Svg>
  );
}
