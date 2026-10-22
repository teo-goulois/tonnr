import { useId } from "react";
import { type StyleProp, StyleSheet, View, type ViewStyle } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { Glyph, type GlyphIcon } from "@/components/shared/glyph";
import { useTheme } from "@/lib/theme";
import { light } from "@/theme/tokens";

import type { TextStep } from "./text";

// The web's `Tile` (`landing-parts.tsx`): a small square set in a line of text, as an app's icon
// is, an icon in white on a color of the sea's scales, raised off the page. It is sized by the
// step of the text it stands in, in the web's proportions of an em: 0.92 for its side, 0.26 for
// its corner and 0.56 for its icon. Its depth is the web's own, since the theme's shadows are
// none: a light that falls from above, a crisp edge and a shadow under it, and the lighter part
// of a Fill Duo icon raised from its 40 % so that it still reads in white on a color.

const RAISED =
  "inset 0 0 0 1px rgba(0, 0, 0, 0.08), inset 0 1.5px 0 rgba(255, 255, 255, 0.25), 0 1px 2px rgba(0, 0, 0, 0.12), 0 2px 6px -2px rgba(0, 0, 0, 0.16)";
const DUO = 0.7;

type TileProps = {
  icon: GlyphIcon;
  /** A color of the sea's scales. */
  color: string;
  /** The step of the text it stands in, which sizes it: `xl`, the onboarding's, by default. */
  size?: TextStep;
  style?: StyleProp<ViewStyle>;
};

/** An icon on a raised square of color. It says nothing: its line says it. */
export function Tile({ icon, color, size = "xl", style }: TileProps) {
  const { type } = useTheme();
  // A gradient is named in its drawing, and React's ids hold colons that a `url()` would misread.
  const shade = `tile-${useId().replaceAll(":", "")}`;
  const em = type[size].size;
  const side = em * 0.92;
  const corner = em * 0.26;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          width: side,
          height: side,
          borderRadius: corner,
          borderCurve: "continuous",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: color,
          boxShadow: RAISED,
        },
        style,
      ]}
    >
      {/* The light is drawn with its own corners, so that the tile clips nothing and keeps the
          shadow under it. */}
      <Svg style={StyleSheet.absoluteFill} accessible={false}>
        <Defs>
          <LinearGradient id={shade} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#ffffff" stopOpacity={0.25} />
            <Stop offset="1" stopColor="#ffffff" stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" rx={corner} ry={corner} fill={`url(#${shade})`} />
      </Svg>
      <Glyph icon={icon} size={em * 0.56} color={light["neutral-1"]} duo={DUO} />
    </View>
  );
}
