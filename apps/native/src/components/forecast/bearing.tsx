import { ArrowUpIcon } from "@repo/ui/icon";
import { View } from "react-native";
import Svg, { Line } from "react-native-svg";

import { Glyph } from "@/components/shared/glyph";
import { Text, type TextProps } from "@/components/ui/text";
import { compassName, compassPoint, formatNumber } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

// How a direction and the tide's way are written everywhere, as the web's `Bearing` and
// `TideTrend` write them: an arrow that points the way the wind or the swell goes, then the name
// of the point it comes from. Never a name alone: the arrow has turned it into a direction.

/** An arrow that points the way something goes, from the bearing it comes from. */
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
      style={{ width: size, height: size, transform: [{ rotate: `${fromDegrees + 180}deg` }] }}
    >
      <Glyph icon={ArrowUpIcon} size={size} color={color} />
    </View>
  );
}

/** An arrow in a line of text, which points the way the sea or the wind goes. */
export function InlineArrow({ fromDegrees, color }: { fromDegrees: number; color: string }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: 13, height: 13, transform: [{ rotate: `${fromDegrees + 180}deg` }] }}
    >
      <Glyph icon={ArrowUpIcon} size={13} color={color} />
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
  // The arrow's size: the text's own, near enough, by default.
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
  arrow = 13,
  color,
  size = "s",
  ...text
}: BearingProps) {
  const { colors } = useTheme();
  const name = named ? compassName(degrees) : compassPoint(degrees);
  return (
    <View
      accessible
      accessibilityLabel={`${m.alert_from()} ${compassName(degrees)}${withDegrees ? `, ${formatNumber(degrees, 0)}°` : ""}`}
      style={{ flexDirection: "row", alignItems: "center", gap: 3 }}
    >
      <DirectionArrow fromDegrees={degrees} size={arrow} color={color ?? colors["neutral-10"]} />
      <Text size={size} numberOfLines={1} style={color ? { color } : undefined} {...text}>
        {name}
        {withDegrees ? ` ${formatNumber(degrees, 0)}°` : ""}
      </Text>
    </View>
  );
}

/** Which way the tide goes, as a line of its own: an arrow up or down, then the word. */
export function TideTrend({
  trend,
  size = "s",
  color,
}: {
  trend: "rising" | "falling";
  size?: TextProps["size"];
  color?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
      <DirectionArrow
        fromDegrees={trend === "rising" ? 180 : 0}
        size={13}
        color={color ?? colors["neutral-10"]}
      />
      <Text size={size} style={color ? { color } : undefined}>
        {trend === "rising" ? m.alert_trend_rising() : m.alert_trend_falling()}
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
