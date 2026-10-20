// What a widget is given for an entry: everything it shows, written by the app as it is shown, in
// the account's units and the app's language, and colored from the sea's scales (decision 074).
// A widget imports nothing and reads no message, so nothing here is left for it to compute. A
// value that says nothing is left out, never null: the system keeps an entry in a property list,
// which holds no null.

/** A height or a wind on its color of the sea's scale, with the ink its figure is written in. */
export type WidgetPill = { label: string; color: string; ink: string };

/** What the sea does at a place at the hour of an entry. */
export type WidgetFigures = {
  height?: WidgetPill;
  /** The period of the waves, such as "12 s". */
  period?: string;
  /** The point the waves come from, such as "WNW", after an arrow that points `wavesTo`. */
  wavesFrom?: string;
  /** The way the waves go, clockwise from north, which the arrow is turned to. */
  wavesTo?: number;
  wind?: WidgetPill;
  /** How the wind meets the shore, such as "offshore". */
  shore?: string;
  /** The next high or low, such as "High tide 14:10". */
  tide?: string;
  /**
   * All of it for a screen reader, in the words of the app's rows: "1.1 m, 12 s, from
   * west-northwest, wind 10 kn, Offshore, High tide 14:10".
   */
  spoken: string;
};

/** An hour ahead, as the widget of the next hours draws it in a column. */
export type WidgetHour = {
  /** Its time, such as "14:00". */
  time: string;
  height?: WidgetPill;
  period?: string;
  wind?: WidgetPill;
};

/** A place, as a widget shows it at the hour of an entry. */
export type WidgetPlace = {
  name: string;
  /** What a press opens: the place in the app. */
  url: string;
  /** Left out once the place has nothing left to show that is not older than its forecast. */
  figures?: WidgetFigures;
  /** When its figures were fetched or measured, or that the app has to be opened. */
  note: string;
  /** The next hours, for the widget that shows them. */
  hours?: WidgetHour[];
};

/** What a widget shows in the place of a place: signed out, nothing saved, a place gone. */
export type WidgetNotice = { title: string; body: string; url: string };

/** The colors of a widget's ground and its ink, in one appearance of the phone. */
export type WidgetPalette = { ground: string; ink: string; muted: string };

/**
 * What a widget draws: one place's sea now, one place's next hours, or the favourites. The three
 * widgets share one layout, since a widget's code can import none from another, and the sea now
 * draws itself on the lock screen in that screen's two families.
 */
export type WidgetView = "sea" | "hours" | "favorites";

export type WidgetProps = {
  palette: { light: WidgetPalette; dark: WidgetPalette };
  view?: WidgetView;
  /** Shown in the place of any place: the account is signed out. */
  notice?: WidgetNotice;
  /** The places the widget may show, by `<kind>:<id>`. */
  places?: Record<string, WidgetPlace>;
  /** The keys of the favourites the widget shows, the first first. */
  favorites?: string[];
  /** What a widget shows when the favourites are empty. */
  empty?: WidgetNotice;
  /**
   * What a widget whose place is chosen shows when that place is not among those it was given: no
   * longer saved, or past the first twelve, which are all it is given.
   */
  missing?: WidgetNotice;
};
