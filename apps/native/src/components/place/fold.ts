// How tall a place's sheet stands while it is low: as tall as the summary of its panel, the
// name, the sea now and the tiles, and nothing that is cut. It stays between 36 and 60
// hundredths of the screen, and opens at 46, where a panel that marks nothing leaves it.
// Decision 040, which the web reads from `SHEET_FOLD` (`viewer-drawer.tsx`). Pure, so that a
// test reads it.

export const FOLD_LOWEST = 0.36;
export const FOLD_HIGHEST = 0.6;
export const FOLD_NONE = 0.46;
/** The height a raised sheet takes. */
export const RAISED = 0.94;

/** The share of the screen the low sheet takes, to two hundredths, for a summary that ends there. */
export function lowDetent(foldBottom: number | undefined, screenHeight: number) {
  if (foldBottom === undefined || !(foldBottom > 0) || !(screenHeight > 0)) return FOLD_NONE;
  const share = Math.min(FOLD_HIGHEST, Math.max(FOLD_LOWEST, foldBottom / screenHeight));
  return Math.ceil(share * 100) / 100;
}

/** Whether a new low height is worth moving the sheet for: a few points are not. */
export function isWorthMoving(from: number, to: number) {
  return Math.abs(from - to) >= 0.02;
}
