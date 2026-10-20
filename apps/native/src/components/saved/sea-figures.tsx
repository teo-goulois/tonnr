import { WAVE_HEIGHT_SCALE, WIND_SPEED_SCALE, scaleColor, scaleInk } from "@repo/client/sea-scales";
import type { ReactNode } from "react";
import { View } from "react-native";

import { Bearing } from "@/components/forecast/bearing";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { formatSeconds } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { formatHeight, formatWind, useUnits } from "@/lib/units";
import { m } from "@/paraglide/messages";

import { seaWords, shoreWord } from "./place-words";
import type { SeaFigures } from "./sea-now";

// The sea now at a place, as its row and its preview draw it: the height on its color of the
// sea's scale, the wind on the wind's, each with its figure written on it in the reader's unit,
// so that the color is never all that says it (decision 033 and `sea-scales.ts`). A direction is
// an arrow that points the way the sea goes, then the point it comes from, never a name alone.

// How the wind meets the shore, and the sea now for a screen reader, in words, which the widgets
// write too.
export { seaWords, shoreWord };

type PillSize = "row" | "large";

const PILL = {
  row: { height: 28, minWidth: 56, padding: "xs", text: "s" },
  large: { height: 40, minWidth: 76, padding: "s", text: "l" },
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
  const { space } = useTheme();
  const shape = PILL[size];
  return (
    <View
      style={{
        height: shape.height,
        minWidth: shape.minWidth,
        paddingHorizontal: space[shape.padding],
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

/** The place of a pill while the sea there is on its way. */
export function PillSkeleton() {
  return <Skeleton width={PILL.row.minWidth} height={PILL.row.height} round />;
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

/** Where the sea or the wind comes from, on a muted line: the forecast's `Bearing`, at its size. */
export function MutedBearing({ degrees }: { degrees: number }) {
  const { colors } = useTheme();
  return <Bearing degrees={degrees} arrow={12} color={colors["neutral-7"]} dense />;
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
    parts.push(<MutedBearing key="waves" degrees={figures.wavesFromDegrees} />);
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
