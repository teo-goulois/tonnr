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

/**
 * An icon of `@repo/ui/icon`, the one place the app's icons come from (decision 069): a local
 * one, or Nucleo's, whose type says a component may answer a promise, which none of them does.
 */
export type GlyphIcon = (props: IconProps) => ReactNode | Promise<ReactNode>;

type GlyphProps = {
  icon: GlyphIcon;
  size?: number;
  /** A color, or else the theme's text color. */
  color?: string;
  /** What a screen reader says of it. Without it, the icon says nothing. */
  label?: string;
  /** The opacity of a Fill Duo icon's lighter part, raised from its own on a tile of color. */
  duo?: number;
} & Omit<IconProps, "color" | "size">;

/** An icon of the web's, drawn natively, at a size in points and in a color. */
export function Glyph({ icon: Icon, size = 20, color, label, duo, ...props }: GlyphProps) {
  const text = useCSSVariable("--cte-text");
  const drawn = Icon(props) as ReactNode;
  return drawTree(drawn, NATIVE, {
    size,
    color: color ?? (typeof text === "string" ? text : "#000000"),
    label,
    duo,
  });
}
