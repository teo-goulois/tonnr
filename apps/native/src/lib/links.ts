import { type AppLink, readAppLink } from "@repo/config/links";
import type { Href } from "expo-router";

/** A route of the app, as a string: what expo-router's types take as one, and a string still. */
export type Route = Extract<Href, string>;

/**
 * Where a link takes the app: the route of a screen, or an address to open in the browser inside
 * the app. A universal link, an App Link, a link of the app's scheme and the address a push
 * carries are all read by `readAppLink` (packages/config/src/links.ts), as the web reads them,
 * then turned here into the app's own routes. Decision 073.
 */
export type AppDestination =
  | { route: Route }
  // The page of a surf break names it by its address; the route is found by asking the API.
  | { breakPage: { country: string; region: string; slug: string } }
  | { browser: string };

// The steps of the account's tab that an address of the web names with `settings=`.
const ACCOUNT_STEPS: Record<string, string> = {
  alerts: "/account/alerts",
  profile: "/account/profile",
  sessions: "/account/logbook",
  contributions: "/account/contributions",
  friends: "/account/friends",
  blocked: "/account/blocked",
  delete: "/account/delete",
};

const KINDS = ["break", "station", "spot"] as const;

// A route the app has, written from a link: expo-router's types read only the routes written out.
const routeOf = (path: string) => path as Route;

function withQuery(path: string, query: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(query)) if (value) params.set(name, value);
  const written = params.toString();
  return routeOf(written ? `${path}?${written}` : path);
}

/** The route of the app for what a link names. */
export function destinationOf(link: AppLink): AppDestination {
  if (link.screen === "browser") return { browser: link.url };
  if (link.screen === "break") {
    return { breakPage: { country: link.country, region: link.region, slug: link.slug } };
  }
  if (link.screen === "reset-password") {
    return { route: withQuery("/reset-password", { token: link.token ?? undefined }) };
  }

  const search = link.search;
  // An alert begun at a break from its page: decision 059's button.
  if (search.create === "alert" && search.break) {
    return { route: withQuery("/alert/new", { place: `break:${search.break}` }) };
  }
  for (const kind of KINDS) {
    const id = search[kind];
    if (id) {
      const tab = search.notice ? "reports" : search.tab;
      return {
        route: withQuery(`/place/${kind}/${encodeURIComponent(id)}`, {
          tab,
          notice: search.notice,
        }),
      };
    }
  }
  // A list opened by its link is read in the saved tab, which the web's short address opens, or
  // alone on the map, as the web's phone shows `?shared=` without its panel.
  if (search.shared) {
    if (search.panel === "saved") {
      return { route: routeOf(`/saved/shared/${encodeURIComponent(search.shared)}`) };
    }
    return { route: withQuery("/", { shared: search.shared }) };
  }
  if (search.invite) return { route: withQuery("/", { invite: search.invite }) };
  // How to be told was a part of the alerts' panel once: every alert's mail still links there.
  if (search.alerts === "settings") return { route: "/account/alerts" };
  // A list shown alone, on the map, or in the saved tab too when the address names it.
  if (search.list) {
    return { route: withQuery(search.panel === "saved" ? "/saved" : "/", { list: search.list }) };
  }
  if (search.panel === "saved") return { route: "/saved" };
  if (search.panel === "alerts") {
    // The alerts themselves, `My alerts`, which the alerts' tab reads in `view`.
    return { route: withQuery("/alerts", { view: search.alerts === "mine" ? "mine" : undefined }) };
  }
  if (search.panel === "account") {
    const step = search.settings ? ACCOUNT_STEPS[search.settings] : undefined;
    return { route: routeOf(step ?? "/account") };
  }
  return { route: "/" };
}

/** Where an address takes the app, read against the web app's site it was built with. */
export function destinationOfAddress(address: string, site: string): AppDestination {
  return destinationOf(readAppLink(address, site));
}
