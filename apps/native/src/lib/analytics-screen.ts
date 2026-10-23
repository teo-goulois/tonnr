import { featureOf, SIGN_IN_FEATURE } from "@repo/client/analytics";

// The screen in view in the categories of `feature_viewed`, which the web app reads from its
// address (`featureOf`): the app says its own in the same words, from its routes. A module that
// imports nothing of React Native, so that a test reads it.

const PLACES = new Set(["break", "station", "spot"]);
const SIGNING_IN = new Set(["/sign-in", "/forgot-password", "/reset-password"]);

type Params = Record<string, string | string[] | undefined>;

/**
 * The screen of an address of the app, as `feature:tab:place_kind`: the map, a tab, a step of the
 * account's tab (its log of sessions is the web's `sessions`), a place open over the map with the
 * tab its address asks, or the sign-in. Null for what stands over a screen, an alert's editor or
 * a session's form, which leaves the screen under it as it was, as the web's address keeps its
 * panel under such a sheet.
 */
export function screenFeatureOf(path: string, params: Params): string | null {
  if (SIGNING_IN.has(path)) return SIGN_IN_FEATURE;
  const [first, second, third] = path.split("/").filter(Boolean);
  if (first === undefined) return featureOf({});
  if (first === "saved" || first === "alerts") return featureOf({ panel: first });
  if (first === "account") {
    return featureOf({ panel: "account", settings: second === "logbook" ? "sessions" : second });
  }
  if (first === "place" && second && PLACES.has(second) && third) {
    return featureOf({ [second]: third, tab: params.tab });
  }
  return null;
}
