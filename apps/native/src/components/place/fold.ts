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

/** The room iOS 26 leaves around a low sheet, at its sides and under it, in points. */
export const IOS_FLOAT_MARGIN = 8;

/**
 * How tall a low sheet laid out `laidOut` points tall stands on a screen `width` wide: iOS 26
 * floats it, drawn smaller by the room it leaves at its sides, with that room under it, where
 * its layout knows nothing of it. Earlier systems draw it as it is laid out. Measured on the
 * screen of an iPhone of 402 by 874 points: 386 wide, its foot 8 over the bottom.
 */
export function standingHeight(laidOut: number, width: number, floating: boolean) {
  if (!floating || !(width > 2 * IOS_FLOAT_MARGIN)) return laidOut;
  return IOS_FLOAT_MARGIN + (laidOut * (width - 2 * IOS_FLOAT_MARGIN)) / width;
}

/** Whether the platform floats a sheet that is not at its largest: iOS from its 26th version. */
export function floatsSheets(os: string, version: string | number) {
  return os === "ios" && Number.parseInt(String(version), 10) >= 26;
}

/** The most the platform's sheet is taken to stand from where its share puts it, in points. */
export const MAX_SHEET_SHIFT = 40;

/**
 * How far over the height its share gives the low sheet really stands, measured, in points: some
 * 20 on an iPhone of 874 points, under iOS 26. None for a measure that cannot be one, taken before
 * the sheet is shown or as it moved.
 */
export function sheetShift(measured: number, computed: number) {
  const shift = Math.round(measured - computed);
  return Number.isFinite(shift) && Math.abs(shift) <= MAX_SHEET_SHIFT ? shift : undefined;
}

/** Whether a new low height is worth moving the sheet for: a few points are not. */
export function isWorthMoving(from: number, to: number) {
  return Math.abs(from - to) >= 0.02;
}
