import type { SavedList } from "@repo/client/viewer/types";
import type { WidgetConfigurationEnum } from "expo-widgets";
import { Platform } from "react-native";

import { codeOf } from "@/components/lists/items";
import { inputOf, type PlacesNow } from "@/components/saved/sea-now";
import { authClient } from "@/lib/auth-client";
import { client } from "@/utils/orpc";

import {
  placeOptions,
  signedOutTimelines,
  timelinesOf,
  type WidgetPlaces,
  type WidgetTimelines,
  widgetPlaces,
} from "./entries";
import { PLACE_WIDGETS, WIDGETS } from "./layouts";
import { PLACE_PARAMETER, WIDGET } from "./names";

// What the app writes for its widgets, in the space it shares with its extensions,
// `group.app.tonnr`, where expo-widgets keeps each widget's timeline and the places its person
// may choose: decision 074. It writes them whenever it runs, when the account's saved places, its
// units or its language change, and in the background task the system runs when it chooses, from
// one call of `places.now` for every place the widgets show. Signing out writes over all of it.
// The widgets are iOS's alone for now: expo-widgets 58 draws Android's with Glance, where a press
// opens nothing and no timeline says when a figure is too old to show.

/** Whether this phone has the widgets: an iPhone. */
export const HAS_WIDGETS = Platform.OS === "ios";

/** How long the app lets an answer stand before it asks again as it comes to the foreground. */
export const ASKED_AGAIN_AFTER_MS = 15 * 60 * 1000;

/** The last answer, which a change of the units writes again without asking the API. */
let kept: { answer: PlacesNow; places: WidgetPlaces; at: number } | null = null;
/** Counts the clearings: an answer asked before the last one is never written after it. */
let clearings = 0;

// What each widget was last given, so that the system draws a widget again only for a change:
// iOS lets a widget be drawn a limited number of times a day.
const WRITTEN_KEY = "widgets-written";
let written: Record<string, string> | null = null;

function writtenBefore(): Record<string, string> {
  if (!written) {
    try {
      written = JSON.parse(localStorage.getItem(WRITTEN_KEY) ?? "{}") as Record<string, string>;
    } catch {
      written = {};
    }
  }
  return written;
}

/** A short digest of what was written, FNV-1a over its text. */
function digestOf(text: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/**
 * Gives each widget its timeline, and those whose place is chosen the places they offer, or none
 * but the first of the favourites, which the app's config names, when `options` is undefined.
 * What is the same as it was last is not given again. A widget the system refuses to write is
 * written at the next time, and never stops what called, a sign-out among them.
 */
function write(timelines: WidgetTimelines, options: WidgetConfigurationEnum[] | undefined) {
  const before = writtenBefore();
  const give = (key: string, what: unknown, put: () => void) => {
    const digest = digestOf(JSON.stringify(what ?? null));
    if (before[key] === digest) return;
    try {
      put();
      before[key] = digest;
    } catch {
      delete before[key];
    }
  };
  for (const name of Object.values(WIDGET)) {
    const entries = timelines[name];
    give(`timeline ${name}`, entries, () => WIDGETS[name].updateTimeline(entries));
  }
  give("options", options, () => {
    for (const widget of PLACE_WIDGETS) {
      widget.setConfigurationParameterEnum(PLACE_PARAMETER, options);
    }
  });
  try {
    localStorage.setItem(WRITTEN_KEY, JSON.stringify(before));
  } catch {
    // The widgets are then given their timelines again at the app's next start, unchanged.
  }
}

function writeKept(now: Date) {
  if (!kept) return;
  write(
    timelinesOf({ answer: kept.answer, places: kept.places, now }),
    placeOptions(kept.answer, kept.places.places),
  );
}

/**
 * Writes over every widget that the account is signed out, and takes back the places a widget
 * offered, so that nothing of the account stays in the space the app shares: decision 070.
 */
export function clearWidgets() {
  if (!HAS_WIDGETS) return;
  kept = null;
  clearings += 1;
  write(signedOutTimelines(), undefined);
}

/**
 * Writes the widgets again from the last answer, as they would be shown now: when the account's
 * units change. Nothing is asked of the API.
 */
export function rewriteWidgets(now = new Date()) {
  if (!HAS_WIDGETS) return;
  writeKept(now);
}

type Refresh = { lists?: readonly SavedList[]; unlessNewerThan?: number; now?: Date };

/** The refresh under way, which the next one waits for: two never ask at once. */
let running: Promise<void> = Promise.resolve();

/**
 * Asks for the sea at every place the widgets may show, and writes them. `lists` are the account's
 * lists when the app holds them already, else they are asked first. An answer newer than
 * `unlessNewerThan` milliseconds, for the same places, stands. A phone with no session writes
 * that it is signed out; an API it cannot reach leaves the widgets as they were, whose timeline
 * ends on its own with an entry that asks for the app to be opened.
 */
export function refreshWidgets(refresh: Refresh = {}) {
  if (!HAS_WIDGETS) return Promise.resolve();
  running = running.then(() => refreshOnce(refresh));
  return running;
}

/** One refresh, which never fails: what it could not do is left as it was. */
async function refreshOnce({ lists, unlessNewerThan = 0, now = new Date() }: Refresh) {
  const asked = clearings;
  try {
    if (!(await authClient.getCookie())) {
      clearWidgets();
      return;
    }
    const places = widgetPlaces(lists ?? (await client.v1.lists.list()).lists);
    const same = kept && JSON.stringify(kept.places) === JSON.stringify(places);
    if (same && kept && now.getTime() - kept.at < unlessNewerThan) {
      writeKept(now);
      return;
    }
    const answer: PlacesNow =
      places.places.length > 0
        ? await client.v1.places.now(inputOf(places.places))
        : { at: now, places: [] };
    // The account signed out, or another signed in, while the answer was on its way.
    if (asked !== clearings) return;
    kept = { answer, places, at: now.getTime() };
    writeKept(now);
  } catch (error) {
    if (codeOf(error) === "UNAUTHORIZED" && asked === clearings) clearWidgets();
  }
}
