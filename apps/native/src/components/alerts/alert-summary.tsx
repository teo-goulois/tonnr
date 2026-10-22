import type { Alert } from "@repo/client/viewer/types";
import { ArrowUpIcon } from "@repo/ui/icon";
import { Fragment } from "react";
import { View } from "react-native";

import { DirectionArrow } from "@/components/forecast/bearing";
import { Glyph } from "@/components/shared/glyph";
import { Text } from "@/components/ui/text";
import { compassPoint } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { useUnits } from "@/lib/units";
import { m } from "@/paraglide/messages";

import { type LineValue, alertLine } from "./summary";

// What an alert asks, in a line of small muted text, as the web's `AlertSummary` draws it: a
// direction is the arrow of the way it goes, then the point it comes from, as `Bearing` writes
// it, and the tide of an alert written before the cycle is an arrow up or down, then its word, as
// `TideTrend` writes it. The arrows stand in the line, at 0.85 of its type as the web's do, and a
// screen reader is given the line in words (`alertLine(alert).spoken`).

// A space that no line breaks at: an arrow stays with its word, as the web's `whitespace-nowrap`.
const JOIN = " ";

// The line of an arrow in a line of text, in the icon's own units, as the web draws both arrows.
const STROKE = 2.25;

/** The size of an arrow in a line of the theme's small type: 0.85 of it, as the web's. */
function useArrowSize() {
  const { type } = useTheme();
  return Math.round(type.s.size * 0.85);
}

/**
 * A direction in a line of text, the web's `Bearing`: the arrow of the way it goes, then the
 * point it comes from, in the line's own color.
 */
export function InlineBearing({ degrees, color }: { degrees: number; color: string }) {
  const size = useArrowSize();
  return (
    <>
      <DirectionArrow fromDegrees={degrees} size={size} color={color} strokeWidth={STROKE} />
      {JOIN}
      {compassPoint(degrees)}
    </>
  );
}

/** Which way the tide goes in a line of text, the web's `TideTrend`: an arrow, then the word. */
function InlineTrend({ trend, color }: { trend: "rising" | "falling"; color: string }) {
  const size = useArrowSize();
  return (
    <>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          width: size,
          height: size,
          transform: [{ rotate: trend === "falling" ? "180deg" : "0deg" }],
        }}
      >
        <Glyph icon={ArrowUpIcon} size={size} color={color} strokeWidth={STROKE} />
      </View>
      {JOIN}
      {trend === "rising" ? m.alert_trend_rising() : m.alert_trend_falling()}
    </>
  );
}

function InlineValue({ value, color }: { value: LineValue; color: string }) {
  if ("text" in value) return value.text;
  if ("arc" in value) {
    return (
      <>
        <InlineBearing degrees={value.arc.from} color={color} />–
        <InlineBearing degrees={value.arc.to} color={color} />
      </>
    );
  }
  return (
    <>
      {value.height === undefined ? "" : `${value.height}, `}
      <InlineTrend trend={value.trend} color={color} />
    </>
  );
}

/** What an alert asks, in two lines at most: its conditions, then the shortest window. */
export function AlertSummary({ alert }: { alert: Pick<Alert, "criteria" | "shortestMinutes"> }) {
  // The heights and the wind are written in the unit their reader chose.
  useUnits();
  const { colors } = useTheme();
  const { groups, after } = alertLine(alert);
  const ink = colors["neutral-7"];
  const or = ` ${m.alert_or_word()} `;
  return (
    <Text size="s" tone="muted" numberOfLines={2}>
      {groups.map(([name, parts]) => (
        <Fragment key={name}>
          {name}{" "}
          {parts.map((values, index) => (
            // The parts of a group keep their order: nothing else tells them apart.
            // oxlint-disable-next-line react/no-array-index-key
            <Fragment key={index}>
              {index > 0 ? ", " : ""}
              {values.map((value, at) => (
                // The values of a part keep their order too.
                // oxlint-disable-next-line react/no-array-index-key
                <Fragment key={at}>
                  {at > 0 ? or : ""}
                  <InlineValue value={value} color={ink} />
                </Fragment>
              ))}
            </Fragment>
          ))}
          {" · "}
        </Fragment>
      ))}
      {after}
    </Text>
  );
}
