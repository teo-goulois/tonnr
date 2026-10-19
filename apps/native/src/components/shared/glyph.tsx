import type { IconProps } from "@repo/ui/icon";
import type { ReactNode } from "react";
import Svg, {
  Circle,
  ClipPath,
  Defs,
  Ellipse,
  G,
  Line,
  LinearGradient,
  Mask,
  Path,
  Polygon,
  Polyline,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";
import { useCSSVariable } from "uniwind";

import { drawTree, type SvgRenderer } from "./svg-tree";

const NATIVE: SvgRenderer = {
  svg: Svg,
  circle: Circle,
  clipPath: ClipPath,
  defs: Defs,
  ellipse: Ellipse,
  g: G,
  line: Line,
  linearGradient: LinearGradient,
  mask: Mask,
  path: Path,
  polygon: Polygon,
  polyline: Polyline,
  radialGradient: RadialGradient,
  rect: Rect,
  stop: Stop,
};

type GlyphProps = {
  /** An icon of `@repo/ui/icon`, the one place the app's icons come from (decision 069). */
  icon: (props: IconProps) => ReactNode;
  size?: number;
  /** A color, or else the theme's text color. */
  color?: string;
  /** What a screen reader says of it. Without it, the icon says nothing. */
  label?: string;
} & Omit<IconProps, "color" | "size">;

/** An icon of the web's, drawn natively, at a size in points and in a color. */
export function Glyph({ icon: Icon, size = 20, color, label, ...props }: GlyphProps) {
  const text = useCSSVariable("--cte-text");
  const drawn = Icon(props);
  return drawTree(drawn, NATIVE, {
    size,
    color: color ?? (typeof text === "string" ? text : "#000000"),
    label,
  });
}
