import { PinIcon } from "@repo/ui/icon";
import { View } from "react-native";

import { Glyph } from "@/components/shared/glyph";
import { edge } from "@/components/ui/edge";
import { useTheme } from "@/lib/theme";

// The marker of a spot being added, as the web's `SpotPin` draws it: a head to take hold of, on a
// stem whose foot is the point, in the accent as the account's own spots are on the map. The map
// holds it at its point, and a finger drags it from there.

const HEAD = 36;
const STEM = 12;
/** How wide the foot of the marker is, in points. The point is its middle. */
export const SPOT_PIN_FOOT = 6;

export function SpotPin({ label }: { label?: string | undefined }) {
  const { colors, border } = useTheme();
  return (
    <View
      accessible={label !== undefined}
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      style={{ alignItems: "center" }}
    >
      <View
        style={{
          width: HEAD,
          height: HEAD,
          borderRadius: HEAD / 2,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors["color-1"],
          ...edge(colors["neutral-1"], { width: border.l }),
        }}
      >
        <Glyph icon={PinIcon} size={18} color={colors["neutral-1"]} />
      </View>
      <View style={{ width: 2, height: STEM, backgroundColor: colors["color-1"] }} />
      <View
        style={{
          marginTop: -1,
          width: SPOT_PIN_FOOT,
          height: SPOT_PIN_FOOT,
          borderRadius: SPOT_PIN_FOOT / 2,
          backgroundColor: colors["color-1"],
          ...edge(colors["neutral-1"], { width: 1 }),
        }}
      />
    </View>
  );
}
