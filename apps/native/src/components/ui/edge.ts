import { border } from "@/theme/tokens";

// A component's edge, as the web draws it with its `edge` and `edge-inset` utilities: a fine line
// laid as a shadow, never a border, so that it takes no room and keeps its corners. React Native
// draws a spread shadow on iOS and on Android 9 and later; an older Android draws no edge.

export type EdgeStyle = { boxShadow: string };

/** A line of `color` around a view: outside it, or inside with `inset`, as a button has it. */
export function edge(
  color: string,
  { inset = false, width = border.s }: { inset?: boolean; width?: number } = {},
): EdgeStyle {
  return { boxShadow: `${inset ? "inset " : ""}0 0 0 ${width}px ${color}` };
}
