import { WAVE_HEIGHT_SCALE, scaleColor, scaleInk } from "@repo/client/sea-scales";
import { View } from "react-native";

import { DirectionArrow } from "@/components/forecast/bearing";
import { SMALL_MARK } from "@/components/search/found-list";

import { seaWords, shoreWord } from "./place-words";

// What a buoy reads, as a row of the saved tab draws it beside its name: the web's `HeightChip`,
// the height's color of the sea's scale (`sea-scales.ts`) with an arrow that points the way the
// waves go, in the place of the mark a break or a spot has. The figures themselves are written
// beside it, in the reader's unit, so that the color is never all that says them.

// How the wind meets the shore, and the sea now for a screen reader, in words, which the widgets
// write too.
export { seaWords, shoreWord };

/** A wave height on its color, with where the waves go. */
export function HeightChip({
  meters,
  fromDegrees,
}: {
  meters: number;
  /** Where the waves come from, clockwise from north, or null when the buoy does not say. */
  fromDegrees: number | null;
}) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: SMALL_MARK,
        height: SMALL_MARK,
        borderRadius: SMALL_MARK / 2,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: scaleColor(WAVE_HEIGHT_SCALE, meters),
      }}
    >
      {fromDegrees !== null ? (
        <DirectionArrow
          fromDegrees={fromDegrees}
          size={14}
          // The web's arrow in a line of text.
          strokeWidth={2.25}
          color={scaleInk(WAVE_HEIGHT_SCALE, meters)}
        />
      ) : null}
    </View>
  );
}
