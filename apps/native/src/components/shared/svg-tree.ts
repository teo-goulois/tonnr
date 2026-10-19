import { createElement, Fragment, isValidElement, type ReactElement, type ReactNode } from "react";

/**
 * Draws an icon of `@repo/ui/icon`, which is an SVG for the web, with the components of another
 * renderer: react-native-svg in the app (decision 069). The icon is called as it renders, so its
 * hooks run in the order they always do, and what it draws is walked: each SVG element becomes
 * the renderer's own, and each component inside it, such as Nucleo's `Icon`, is called in turn.
 * Nothing of a drawing is copied out of its package.
 */
export type SvgRenderer = Record<string, unknown> & { svg: unknown };

// What a web SVG writes that a native one does not take, or that names nothing on a phone.
const DROPPED = new Set(["xmlns", "xmlnsXlink", "className", "style", "title", "children", "key"]);

/** A length the web writes in em or px, as the points a native SVG takes. */
export function pointsOf(value: unknown, fallback: number): number {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return fallback;
  const found = /^(\d+(?:\.\d+)?)(px)?$/.exec(value.trim());
  return found ? Number(found[1]) : fallback;
}

/** The props of an SVG element as a native one takes them. */
function nativeProps(props: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(props)) {
    if (DROPPED.has(name) || name.startsWith("data-") || name.startsWith("aria-")) continue;
    if (value === undefined) continue;
    out[name] = value;
  }
  return out;
}

/**
 * The tree of `node` drawn with `renderer`. `root` is the props the outer `<svg>` takes: its size
 * and its color, which each `currentColor` inside reads.
 */
export function drawTree(
  node: ReactNode,
  renderer: SvgRenderer,
  root: { size: number; color: string; label?: string | undefined },
  depth = 0,
): ReactNode {
  if (depth > 32) throw new Error("An icon nests too deep to be drawn");
  if (node === null || node === undefined || typeof node === "boolean") return null;
  if (typeof node === "string" || typeof node === "number") return null;
  if (Array.isArray(node)) {
    return node.map((child, index) =>
      createElement(Fragment, { key: index }, drawTree(child, renderer, root, depth + 1)),
    );
  }
  if (!isValidElement(node)) return null;

  const element = node as ReactElement<Record<string, unknown>>;
  const { type, props } = element;

  if (typeof type === "function") {
    // A component of the icon's own, such as Nucleo's `Icon`, or a glyph drawn in another.
    const drawn = (type as (props: Record<string, unknown>) => ReactNode)(props);
    return drawTree(drawn, renderer, root, depth + 1);
  }
  if ((type as unknown) === Fragment)
    return drawTree(props.children as ReactNode, renderer, root, depth + 1);
  if (typeof type !== "string") return null;
  if (type === "title" || type === "desc") return null;

  const Native = renderer[type];
  if (!Native) throw new Error(`An icon draws <${type}>, which the app cannot draw`);

  const children = drawTree(props.children as ReactNode, renderer, root, depth + 1);
  if (type === "svg") {
    const viewBox = typeof props.viewBox === "string" ? props.viewBox : "0 0 20 20";
    return createElement(
      Native as never,
      {
        ...nativeProps(props),
        width: root.size,
        height: root.size,
        viewBox,
        color: root.color,
        accessible: root.label !== undefined,
        accessibilityLabel: root.label,
      },
      children,
    );
  }
  return createElement(Native as never, nativeProps(props), children);
}
