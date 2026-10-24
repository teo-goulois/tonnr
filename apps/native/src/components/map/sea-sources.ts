// The sources of the sea on the map (decision 077). Each moment of the sea is a source of its
// own, and so is each time a moment is asked again: MapLibre asks a tile once, and a tile the app
// could not draw, slow or refused, is never asked again by the source that wanted it. The map then
// asks the moment again as a new source, whose tiles that came MapLibre keeps already, so that
// only the missing ones are drawn. The source in view stays under the next one until that one is
// drawn whole, and the next fades in over it, so that the sea never goes blank between the two.
// A module that imports nothing of React Native, so that a test reads it.

/** The source of a moment of the sea, asked for the `tries`-th time after the first. */
export const seaKey = (moment: string, tries: number) => `${moment}#${tries}`;

/** The moment a source of the sea shows. */
export const momentOf = (key: string) => {
  const mark = key.lastIndexOf("#");
  return mark === -1 ? key : key.slice(0, mark);
};

/** The sea in view: the source shown, and the one under it until the shown one is drawn whole. */
export type SeaSources = { shown?: string; under?: string };

/**
 * The sources once `coming` is shown, over the one in view, which stays under it. A moment asked
 * again keeps under it the moment before, which has the tiles that the moment's first asking
 * missed. A source that comes back from under is drawn whole already, and is shown alone.
 */
export function showing(sources: SeaSources, coming: string): SeaSources {
  const { shown, under } = sources;
  if (shown === coming) return sources;
  if (shown === undefined || under === coming) return { shown: coming };
  if (under !== undefined && momentOf(shown) === momentOf(coming)) return { shown: coming, under };
  return { shown: coming, under: shown };
}

/** The sources once the shown one is drawn whole, nothing failed: the one under it goes. */
export function drawnWhole(sources: SeaSources): SeaSources {
  return sources.under === undefined ? sources : { shown: sources.shown };
}

// How long the map waits before it asks a moment again, after one, two, three… failures in a row.
const ASK_AGAIN_MS = [2_000, 5_000, 10_000, 20_000, 40_000];
const ASK_AGAIN_MOST_MS = 60_000;

/**
 * How long the map waits before it asks the moment again once a tile of it failed, the
 * `failures`-th time in a row: soon, then less and less often, a minute apart at most, so that a
 * source that is down is not asked over and over.
 */
export function askAgainIn(failures: number): number {
  return ASK_AGAIN_MS[Math.max(0, failures - 1)] ?? ASK_AGAIN_MOST_MS;
}
