import type { NativeStackNavigationOptions } from "expo-router";

// How a screen presents itself as the platform's own sheet, through expo-router: a form sheet,
// with the heights it rests at and a grabber, and no header of the navigation's, since
// `PanelHeader` draws one inside. Its corners are the system's, concentric with the phone's on
// iOS and Material's on Android. A module that imports nothing at run time, so that a test reads it.

export type SheetOptions = {
  /**
   * The heights the sheet rests at, as shares of the screen, from the lowest: at most three,
   * since Android takes no more. `fit` makes it as tall as what it holds.
   */
  detents?: readonly number[] | "fit";
  /** The height it opens at: an index of `detents`, or the last. */
  initial?: number | "last";
  /** The highest height at which what stands under it is not dimmed. */
  undimmedUpTo?: number | "none" | "last";
  grabber?: boolean;
};

/** The heights of a sheet, as the platform takes them, or an error that says why not. */
export function detentsOf(detents: readonly number[]): number[] {
  if (detents.length === 0) throw new Error("A sheet rests at one height at least");
  if (detents.length > 3) throw new Error("Android takes three heights of a sheet at most");
  detents.forEach((detent, index) => {
    if (!(detent > 0 && detent <= 1)) {
      throw new Error(`A sheet's height is a share of the screen, not ${detent}`);
    }
    const before = detents[index - 1];
    if (before !== undefined && detent <= before) {
      throw new Error("A sheet's heights go from the lowest to the highest");
    }
  });
  return [...detents];
}

/** The options of a screen that is a form sheet, for its `Stack.Screen`. */
export function formSheet({
  detents = [1],
  initial = 0,
  undimmedUpTo = "none",
  grabber = true,
}: SheetOptions = {}): NativeStackNavigationOptions {
  const heights = detents === "fit" ? "fitToContents" : detentsOf(detents);
  const count = heights === "fitToContents" ? 1 : heights.length;
  for (const index of [initial, undimmedUpTo]) {
    if (typeof index === "number" && !(Number.isInteger(index) && index >= 0 && index < count)) {
      throw new Error(`A sheet has no height ${index}`);
    }
  }
  return {
    presentation: "formSheet",
    headerShown: false,
    sheetAllowedDetents: heights,
    sheetInitialDetentIndex: initial,
    sheetLargestUndimmedDetentIndex: undimmedUpTo,
    sheetGrabberVisible: grabber,
  };
}
