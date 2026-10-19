import { Text as NativeText, type TextProps as NativeTextProps } from "react-native";

// The theme's type: one family, Geist, in three weights and seven steps, each with its own
// line height, written by the theme's classes so that they stay the web's. A class is written
// whole here, since Uniwind finds the classes it compiles by reading the source.

export type TextStep = "xxs" | "xs" | "s" | "m" | "l" | "xl" | "xxl";
/** 400, 500 and 700, as the theme names them (`--weight-ui-*`). */
export type TextWeight = "regular" | "medium" | "heavy";
export type TextTone = "default" | "muted" | "accent" | "danger";

const STEPS: Record<TextStep, string> = {
  xxs: "text-xxs",
  xs: "text-xs",
  s: "text-s",
  m: "text-m",
  l: "text-l",
  xl: "text-xl",
  xxl: "text-xxl",
};

const WEIGHTS: Record<TextWeight, string> = {
  regular: "font-normal",
  medium: "font-medium",
  heavy: "font-bold",
};

const TONES: Record<TextTone, string> = {
  default: "text-neutral-10",
  muted: "text-neutral-7",
  accent: "text-color-1",
  danger: "text-error",
};

/**
 * How far Dynamic Type may grow what is dense: figures in a row or a tile, a chip, a segment,
 * whose room is counted. Prose grows as far as the reader asked.
 */
export const DENSE_SCALE = 1.3;

const TABULAR = { fontVariant: ["tabular-nums" as const] };

export type TextProps = NativeTextProps & {
  /** A step of the theme. `m`, the body's, by default. */
  size?: TextStep;
  weight?: TextWeight;
  tone?: TextTone;
  /** Figures of one width, so that a number that changes keeps its place. */
  numeric?: boolean;
  /** Grows with Dynamic Type no further than `DENSE_SCALE`. */
  dense?: boolean;
};

/** Text in the theme's type. A color of its own goes in `style`, and wins over `tone`. */
export function Text({
  size = "m",
  weight = "regular",
  tone = "default",
  numeric = false,
  dense = false,
  className,
  style,
  maxFontSizeMultiplier,
  ...props
}: TextProps) {
  return (
    <NativeText
      className={`${STEPS[size]} ${WEIGHTS[weight]} ${TONES[tone]}${className ? ` ${className}` : ""}`}
      style={numeric ? [TABULAR, style] : style}
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? (dense ? DENSE_SCALE : undefined)}
      // The web wraps its text `pretty`: iOS keeps a line's last word from standing alone.
      lineBreakStrategyIOS="standard"
      {...props}
    />
  );
}
