import { WAVE_HEIGHT_SCALE, WIND_SPEED_SCALE, scaleColor, scaleInk } from "@repo/client/sea-scales";
import type { ShoreWind } from "@repo/conditions/shore-wind";
import { ArrowUpIcon } from "@repo/ui/icon";
import type { ReactNode } from "react";
import { View } from "react-native";

import { goingTo } from "@/components/map/features";
import { Glyph } from "@/components/shared/glyph";
import { Text } from "@/components/ui/text";
import { compassName, compassPoint, formatSeconds } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { formatHeight, formatWind, useUnits } from "@/lib/units";
import { m } from "@/paraglide/messages";

import type { SeaFigures } from "./sea-now";

// The sea now at a place, as its row and its preview draw it: the height on its color of the
// sea's scale, the wind on the wind's, each with its figure written on it in the reader's unit,
// so that the color is never all that says it (decision 033 and `sea-scales.ts`). A direction is
// an arrow that points the way the sea goes, then the point it comes from, never a name alone.

const SHORE_WORDS: Record<ShoreWind, () => string> = {
  offshore: m.wind_offshore,
  cross_offshore: m.wind_cross_offshore,
  cross_shore: m.wind_cross_shore,
  cross_onshore: m.wind_cross_onshore,
  onshore: m.wind_onshore,
};

export const shoreWord = (shore: ShoreWind) => SHORE_WORDS[shore]();

type PillSize = "row" | "large";

const PILL = {
  row: { height: 28, minWidth: 56, paddingHorizontal: 8, text: "s" },
  large: { height: 40, minWidth: 76, paddingHorizontal: 13, text: "l" },
} as const;

function Pill({
  color,
  ink,
  label,
  size,
}: {
  color: string;
  ink: string;
  label: string;
  size: PillSize;
}) {
  const shape = PILL[size];
  return (
    <View
      style={{
        height: shape.height,
        minWidth: shape.minWidth,
        paddingHorizontal: shape.paddingHorizontal,
        borderRadius: shape.height / 2,
        borderCurve: "continuous",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: color,
      }}
    >
      <Text
        size={shape.text}
        weight="medium"
        numeric
        dense
        numberOfLines={1}
        style={{ color: ink }}
      >
        {label}
      </Text>
    </View>
  );
}

/** A wave height on its color of the sea's scale. */
export function HeightPill({ meters, size = "row" }: { meters: number; size?: PillSize }) {
  // Drawn again when the reader changes a unit.
  useUnits();
  return (
    <Pill
      color={scaleColor(WAVE_HEIGHT_SCALE, meters)}
      ink={scaleInk(WAVE_HEIGHT_SCALE, meters)}
      label={formatHeight(meters)}
      size={size}
    />
  );
}

/** A wind speed on its color of the wind's scale. */
export function WindPill({ knots, size = "row" }: { knots: number; size?: PillSize }) {
  useUnits();
  return (
    <Pill
      color={scaleColor(WIND_SPEED_SCALE, knots)}
      ink={scaleInk(WIND_SPEED_SCALE, knots)}
      label={formatWind(knots)}
      size={size}
    />
  );
}

/** An arrow that points the way the sea or the wind goes, then the point it comes from. */
export function Bearing({ fromDegrees, size = 12 }: { fromDegrees: number; size?: number }) {
  const { colors, space } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.xxs / 2 }}>
      <View style={{ transform: [{ rotate: `${goingTo(fromDegrees)}deg` }] }}>
        <Glyph icon={ArrowUpIcon} size={size} color={colors["neutral-7"]} />
      </View>
      <Text size="s" tone="muted" dense numberOfLines={1}>
        {compassPoint(fromDegrees)}
      </Text>
    </View>
  );
}

/**
 * The sea now in words, for a screen reader: the height, the period, where the waves come from,
 * then the wind and how it meets the shore. Empty when nothing says the sea.
 */
export function seaWords(figures: SeaFigures | null) {
  if (!figures) return "";
  const words: string[] = [];
  if (figures.heightMeters !== null) words.push(formatHeight(figures.heightMeters));
  if (figures.periodSeconds !== null) words.push(formatSeconds(figures.periodSeconds));
  if (figures.wavesFromDegrees !== null) {
    words.push(m.map_from({ direction: compassName(figures.wavesFromDegrees) }));
  }
  if (figures.windKnots !== null)
    words.push(m.map_wind_speed({ speed: formatWind(figures.windKnots) }));
  if (figures.atShore !== null) words.push(shoreWord(figures.atShore));
  return words.length > 0 ? words.join(", ") : m.station_no_recent_reading();
}

/** The line under a place's name: the period, where the waves come from, the wind at the shore. */
export function SeaLine({ figures }: { figures: SeaFigures }) {
  const { space } = useTheme();
  useUnits();
  const parts: ReactNode[] = [];
  if (figures.periodSeconds !== null) {
    parts.push(
      <Text key="period" size="s" tone="muted" numeric dense numberOfLines={1}>
        {formatSeconds(figures.periodSeconds)}
      </Text>,
    );
  }
  if (figures.wavesFromDegrees !== null) {
    parts.push(<Bearing key="waves" fromDegrees={figures.wavesFromDegrees} />);
  }
  if (figures.windKnots !== null) {
    const wind = formatWind(figures.windKnots);
    parts.push(
      <Text key="wind" size="s" tone="muted" numeric dense numberOfLines={1}>
        {figures.atShore ? `${wind} ${shoreWord(figures.atShore).toLocaleLowerCase()}` : wind}
      </Text>,
    );
  }
  if (parts.length === 0) {
    return (
      <Text size="s" tone="muted" dense numberOfLines={1}>
        {m.station_no_recent_reading()}
      </Text>
    );
  }
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: space.xs }}
    >
      {parts.flatMap((part, index) =>
        index === 0
          ? [part]
          : [
              <Text key={`dot ${index}`} size="s" tone="muted" dense>
                ·
              </Text>,
              part,
            ],
      )}
    </View>
  );
}
