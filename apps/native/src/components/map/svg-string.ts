import { Fragment, isValidElement, type ReactElement, type ReactNode } from "react";

import type { GlyphIcon } from "@/components/shared/glyph";
import { drawTree, type SvgRenderer } from "@/components/shared/svg-tree";

// An icon of `@repo/ui/icon` as the text of an SVG, for what a map draws from a picture: MapLibre
// draws a symbol from an image, which `map-images.ts` paints from this text. The icon is walked as
// `Glyph` walks it (svg-tree.ts), each element kept as its own tag, then written out: nothing of a
// drawing is copied out of its package, which installs with its licence (decision 069). A module
// that imports nothing of React Native, so that a test reads it.

const TAGS = [
  "svg",
  "circle",
  "clipPath",
  "defs",
  "ellipse",
  "g",
  "line",
  "linearGradient",
  "mask",
  "path",
  "polygon",
  "polyline",
  "radialGradient",
  "rect",
  "stop",
];
const AS_TAGS = Object.fromEntries(TAGS.map((tag) => [tag, tag])) as SvgRenderer;

// The attributes SVG itself writes in camel case. Any other is written as the web writes it.
const CAMEL = new Set([
  "viewBox",
  "gradientUnits",
  "gradientTransform",
  "patternUnits",
  "patternContentUnits",
  "preserveAspectRatio",
  "maskUnits",
  "maskContentUnits",
  "clipPathUnits",
  "pathLength",
  "spreadMethod",
]);
// What the walk gives a native SVG that a written one does not take.
const DROPPED = new Set(["accessible", "accessibilityLabel", "children", "key", "color"]);
// A line an icon draws without saying how wide: SVG's own width.
const DEFAULT_STROKE = 1;

const attributeName = (name: string) =>
  CAMEL.has(name)
    ? name
    : name === "xlinkHref"
      ? "xlink:href"
      : name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

const escaped = (value: string) =>
  value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");

/** How one pass of an icon is drawn: its color, and how much wider its lines are. */
export type IconInk = { color: string; widen?: number };

function attributes(props: Record<string, unknown>, ink: IconInk | undefined) {
  const written: string[] = [];
  for (const [name, value] of Object.entries(props)) {
    if (DROPPED.has(name) || value === undefined || value === null || typeof value === "object") {
      continue;
    }
    if (typeof value === "function") continue;
    let text = String(value);
    if (ink && text === "currentColor") text = ink.color;
    if (ink?.widen && name === "strokeWidth") text = String(Number(text) + ink.widen);
    written.push(`${attributeName(name)}="${escaped(text)}"`);
  }
  // A line that says no width is widened from SVG's own.
  if (ink?.widen && "stroke" in props && !("strokeWidth" in props)) {
    written.push(`stroke-width="${DEFAULT_STROKE + ink.widen}"`);
  }
  return written.length > 0 ? ` ${written.join(" ")}` : "";
}

function write(node: ReactNode, ink: IconInk | undefined): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return "";
  if (Array.isArray(node)) return node.map((child) => write(child, ink)).join("");
  if (!isValidElement(node)) return "";
  const element = node as ReactElement<Record<string, unknown>>;
  if (element.type === Fragment) return write(element.props.children as ReactNode, ink);
  if (typeof element.type !== "string") return "";
  const inner = write(element.props.children as ReactNode, ink);
  return `<${element.type}${attributes(element.props, ink)}>${inner}</${element.type}>`;
}

/**
 * An icon as the text of an SVG `size` wide, drawn once for each ink in turn: a wide line of one
 * color under the line of another gives an edge that reads on any ground.
 */
export function iconSvg(
  icon: GlyphIcon,
  { size, inks, props = {} }: { size: number; inks: IconInk[]; props?: Record<string, unknown> },
) {
  const drawn = drawTree(icon(props) as ReactNode, AS_TAGS, { size, color: "currentColor" });
  if (!isValidElement(drawn) || drawn.type !== "svg") {
    throw new Error("An icon draws no <svg> to be written");
  }
  const root = drawn as ReactElement<Record<string, unknown>>;
  const passes = inks.map((ink) => write(root.props.children as ReactNode, ink)).join("");
  const { width, height, viewBox, fill } = root.props;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg"` +
    attributes({ width, height, viewBox, fill }, undefined) +
    `>${passes}</svg>`
  );
}
