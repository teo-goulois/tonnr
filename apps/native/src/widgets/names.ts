// The names of the widgets, which the app's config gives the widget extension and the app gives
// expo-widgets as it writes them: decision 074. A name is a Swift identifier, and stays once a
// widget is on a phone, since the system keeps a widget by it. The app's config writes them
// again, as it reads no file of the app's: `config.test.ts` checks that the two agree. This file
// imports nothing, so that the layouts read it where the build of the extension reads them.

export const WIDGET = {
  /**
   * One place: on the Home Screen its waves, its wind with how it meets the shore, and its tide;
   * on the lock screen the height alone, in a circle, or the height, the wind and the tide.
   */
  seaNow: "SeaNow",
  /** One place with its next hours. */
  nextHours: "NextHours",
  /** The first three places of the favourites, one on each line. */
  favorites: "Favorites",
} as const;

export type WidgetName = (typeof WIDGET)[keyof typeof WIDGET];

/** The widgets whose place is chosen as they are added (iOS 17 and later). */
export const CHOSEN_PLACE: readonly WidgetName[] = [WIDGET.seaNow, WIDGET.nextHours];

/** The parameter of a widget's configuration that names its place. */
export const PLACE_PARAMETER = "place";

/**
 * The value of the place a widget shows before one is chosen, or when its person chose this: the
 * first place of the favourites. A Swift identifier, as the app's config needs its values.
 */
export const FIRST_FAVORITE = "favorite";
