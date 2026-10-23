import { Fragment } from "react";
import { View } from "react-native";

import { sessionWriting } from "@/activities/writing";
import { Bearing } from "@/components/forecast/bearing";
import { Text } from "@/components/ui/text";
import { toKnots } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { useUnits } from "@/lib/units";
import { m } from "@/paraglide/messages";

import type { LiveFigures } from "./live-logic";

// What a session in progress says of itself on its screen, drawn as the web draws what the sea did
// during a session (`SessionConditions`): a heading over lines, each its name at the start in the
// muted ink and its figures at the end, a point between two of them. A direction is an arrow that
// points the way the wind goes, then the point it comes from: never a name alone. Decision 074.

/** A part of a line: a figure, or where something comes from. */
export type FigurePart = { text: string } | { from: number };

/** A line: what it is, then its figures. */
export function FigureLine({ name, parts }: { name: string; parts: FigurePart[] }) {
  const { colors, space, type } = useTheme();
  const writing = sessionWriting();
  const ink = colors["neutral-10"];
  // The arrow of a direction in a line of text, as the web's: 0.85 of the text, its line 2.25.
  const arrow = Math.round(type.s.size * 0.85);
  const spoken = parts
    .map((part) => ("text" in part ? part.text : writing.compassName(part.from)))
    .join(", ");
  return (
    <View
      accessible
      accessibilityLabel={`${name}: ${spoken}`}
      style={{
        flexDirection: "row",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: space.s,
        paddingVertical: space.xxs,
      }}
    >
      <Text size="s" tone="muted" style={{ flexShrink: 1 }}>
        {name}
      </Text>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          justifyContent: "flex-end",
          alignItems: "center",
          flexShrink: 1,
        }}
      >
        {parts.map((part, index) => (
          // The parts keep their order: nothing else tells them apart.
          // oxlint-disable-next-line react/no-array-index-key
          <Fragment key={index}>
            {index > 0 ? (
              <Text size="s" dense style={{ color: ink }}>
                {" · "}
              </Text>
            ) : null}
            {"text" in part ? (
              <Text size="s" numeric dense style={{ color: ink }}>
                {part.text}
              </Text>
            ) : (
              <Bearing
                degrees={part.from}
                size="s"
                color={ink}
                arrow={arrow}
                strokeWidth={2.25}
                numeric
                dense
              />
            )}
          </Fragment>
        ))}
      </View>
    </View>
  );
}

/**
 * The sea as the session began, which `places.now` answered: the next high and the next low, each
 * with its time, and the wind the nearest station last measured, with when, in the account's units.
 */
export function LiveSea({ figures }: { figures: LiveFigures }) {
  useUnits();
  const { space } = useTheme();
  const writing = sessionWriting();
  const { high, low, wind } = figures;
  const shore = wind?.atShore ? writing.shore(wind.atShore) : null;
  const windParts: FigurePart[] = wind
    ? [
        { text: writing.clock(new Date(wind.at)) },
        ...(wind.speedMetersPerSecond === null
          ? []
          : [{ text: writing.wind(toKnots(wind.speedMetersPerSecond)) }]),
        ...(wind.directionDegrees === null ? [] : [{ from: wind.directionDegrees }]),
        ...(shore ? [{ text: shore }] : []),
      ]
    : [];

  return (
    <View style={{ gap: space.xxs }}>
      <Text weight="medium" accessibilityRole="header">
        {m.native_live_sea_at_start()}
      </Text>
      {high ? (
        <FigureLine
          name={m.page_tide_high()}
          parts={[
            { text: writing.clock(new Date(high.at)) },
            { text: writing.height(high.heightMeters) },
          ]}
        />
      ) : null}
      {low ? (
        <FigureLine
          name={m.page_tide_low()}
          parts={[
            { text: writing.clock(new Date(low.at)) },
            { text: writing.height(low.heightMeters) },
          ]}
        />
      ) : null}
      {windParts.length > 1 ? <FigureLine name={m.alert_summary_wind()} parts={windParts} /> : null}
      {!high && !low && windParts.length <= 1 ? (
        <Text size="s" tone="muted">
          {m.native_live_nothing()}
        </Text>
      ) : null}
    </View>
  );
}
