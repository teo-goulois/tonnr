// What a place's sheet takes of the screen, which the map reads under it: how tall the sheet stands
// while it is low, and whether it is raised. The web's drawer tells its viewer the same through
// `onSheetChange` (`viewer-drawer.tsx`): the map's buttons and its legend stand on the low sheet,
// fade away while it is raised, and a place it would cover is brought above it (decision 040).
// Each sheet tells it by its route, and the one opened last is the one in front. A module that
// imports nothing of React Native, so that a test reads it.

/** What a sheet over the map takes of the screen. */
export type Sheet = {
  // How tall it stands from the bottom of the screen while it is low, in points. None once it
  // leaves.
  height: number;
  raised: boolean;
};

export const NO_SHEET: Sheet = { height: 0, raised: false };

const sheets = new Map<string, Sheet>();
let current: Sheet = NO_SHEET;
const listeners = new Set<() => void>();

function told() {
  const last = [...sheets.values()].at(-1) ?? NO_SHEET;
  if (last.height === current.height && last.raised === current.raised) return;
  current = last;
  for (const listener of listeners) listener();
}

/** Says what the sheet of a route takes of the screen, as it opens and as it moves. */
export function showSheet(route: string, sheet: Sheet) {
  sheets.set(route, sheet);
  told();
}

/** Says that the sheet of a route has left. */
export function hideSheet(route: string) {
  sheets.delete(route);
  told();
}

/** What the sheet in front takes of the screen, or nothing when no sheet is open. */
export function currentSheet(): Sheet {
  return current;
}

/** Hears each change of what the sheet in front takes: the map's screen. */
export function onSheetChange(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Where the low sheet's top stands, from the top of a frame that starts `frameTop` points under the
 * top of a screen `screenHeight` tall, and how far from the frame's bottom what stands on it is
 * drawn, `gap` over it: on the frame's own bottom when no sheet is open.
 */
export function floorOver(
  sheet: Sheet,
  frame: { top: number; height: number },
  screenHeight: number,
  gap: number,
) {
  if (sheet.height <= 0) return gap;
  const sheetTop = screenHeight - sheet.height - frame.top;
  return Math.max(gap, frame.height - sheetTop + gap);
}
