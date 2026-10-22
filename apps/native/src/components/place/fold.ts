// How tall a place's sheet stands while it is low: as tall as the summary of its panel, the
// name, the sea now and the tiles, and nothing that is cut. It stays between 30 and 60
// hundredths of the screen, and opens at 46, where a panel that marks nothing leaves it.
// Decision 040, which the web reads from `SHEET_FOLD` (`viewer-drawer.tsx`). Pure, so that a
// test reads it.

export const FOLD_LOWEST = 0.3;
export const FOLD_HIGHEST = 0.6;
export const FOLD_NONE = 0.46;
/** The height a raised sheet takes. */
export const RAISED = 0.94;
/** The room the low sheet leaves under its summary, in points: the web's `FOLD_MARGIN`. */
export const FOLD_MARGIN = 16;

/**
 * How far under the top of the screen the platform lets a sheet rise, past the safe area: iOS
 * leaves this room over a sheet at its largest, where what it covers shows. Android leaves none.
 */
export const IOS_SHEET_GAP = 10;

/**
 * The height of a sheet at its largest, which the platform measures its heights against: the
 * screen less its safe area at the top and, on iOS, the room it leaves there.
 */
export function largestSheet(screenHeight: number, topInset: number, ios: boolean) {
  return screenHeight - topInset - (ios ? IOS_SHEET_GAP : 0);
}

/**
 * The share of the largest sheet the low sheet takes, to two hundredths over, for a summary that
 * ends `foldBottom` points under its top: within the shares of the screen, as the web's drawer
 * keeps it, and over the largest sheet, as the platform takes a height.
 */
export function lowDetent(foldBottom: number | undefined, screenHeight: number, largest: number) {
  if (foldBottom === undefined || !(foldBottom > 0) || !(screenHeight > 0) || !(largest > 0)) {
    return FOLD_NONE;
  }
  const height = Math.min(
    FOLD_HIGHEST * screenHeight,
    Math.max(FOLD_LOWEST * screenHeight, foldBottom),
  );
  // Never at the raised height or over it, which the platform would not take.
  return Math.min(Math.ceil((height / largest) * 100) / 100, RAISED - 0.01);
}

/**
 * The height a sheet of a route stands at as it is drawn, 1 raised and 0 low: the one it was last
 * told, or the one it opened at, which is kept for the route from then on. A sheet given another
 * place is drawn anew with that place's parameters and still stands where it stood: the platform
 * sets the height a sheet opens at once, and says nothing of a height until a finger moves it.
 */
export function sheetDetentOf(known: Map<string, number>, route: string, opensRaised: boolean) {
  const detent = known.get(route) ?? (opensRaised ? 1 : 0);
  known.set(route, detent);
  return detent;
}

/** Whether a new low height is worth moving the sheet for: a few points are not. */
export function isWorthMoving(from: number, to: number) {
  return Math.abs(from - to) >= 0.02;
}
