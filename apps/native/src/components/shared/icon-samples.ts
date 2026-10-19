import * as icons from "@repo/ui/icon";
import type { ReactNode } from "react";

// The icons of `@repo/ui/icon` as the app draws them: what the test of `Glyph` draws, and what
// the design system shows.

/** What each glyph of a surf break needs to say something: they take what they draw. */
export const ICON_SAMPLES: Record<string, Record<string, unknown>> = {
  SwellWindowIcon: { bearings: [270, 292.5] },
  WindWindowIcon: { bearings: [90, 112.5] },
  BreakTypeIcon: { shape: "reef" },
  BottomIcon: { bottoms: ["rock", "sand"] },
  LevelIcon: { levels: [1, 2] },
  SizeFactorIcon: { steps: [1] },
  SeasonIcon: { seasons: ["winter", "autumn"] },
};

/**
 * Google's mark draws its gradient through a foreignObject, which no native SVG has. The app
 * shows Google's own button where it signs in with Google (decision 070).
 */
export const NOT_DRAWN = new Set(["GoogleIcon"]);

export type Icon = (props: icons.IconProps) => ReactNode;

/** Every icon the app draws, by the name it is exported under. */
export const ICONS = (Object.entries(icons) as [string, unknown][]).filter(
  (entry): entry is [string, Icon] => typeof entry[1] === "function" && !NOT_DRAWN.has(entry[0]),
);
