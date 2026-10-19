// By the package's own name, which Node resolves as the app's config loads this file, where a
// path without its extension does not.
import { APP_SCHEME } from "@repo/config/app";
import { LOCALES, localePrefix } from "@repo/config/locales";

// The links that open the apps for phones, and how an app reads one: decision 073. It reads no
// clock and no network, so that the app imports it as the web app does.

/**
 * The addresses of the web app that the apps take, on the web app's domain and in every
 * language: `/fr/b/<id>` as well as `/b/<id>`. A segment written `:name` is one segment of one
 * character or more. Every other address stays in the browser: `/connect`, `/login`,
 * `/verified`, `/mail-off`, the hubs of `/spots`, the landing and the pages beside it. A new
 * page of the web stays there too until it is added here, with what `readAppLink` makes of it.
 * The Worker of the web app writes Apple's file from this list, and the app's config its intent
 * filters on Android.
 */
export const APP_LINK_PATHS = [
  "/app",
  "/b/:id",
  "/s/:id",
  "/l/:token",
  "/i/:token",
  "/spots/:country/:region/:slug",
  "/reset-password",
] as const;

/** Each address of `APP_LINK_PATHS` in each language, as the web app writes it. */
export const claimedPaths = () =>
  LOCALES.flatMap((locale) => APP_LINK_PATHS.map((path) => `${localePrefix(locale)}${path}`));

/**
 * What the map of `/app` reads after its `?`: the web's route reads these and no other, which a
 * test of the web app checks.
 */
export const MAP_PARAMETERS = [
  "station",
  "break",
  "spot",
  "buoy",
  "panel",
  "alerts",
  "settings",
  "tab",
  "notice",
  "create",
  "list",
  "shared",
  "invite",
] as const;

export type MapParameter = (typeof MAP_PARAMETERS)[number];

/** The parameters of the map an address names, as written. The screen checks their values. */
export type MapSearch = Partial<Record<MapParameter, string>>;

/** What an address opens in the app. */
export type AppLink =
  // The map, with what the address selects and opens on it.
  | { screen: "map"; search: MapSearch }
  // The page of a surf break, which the app reads through `pages.break`: the break, or the
  // address of the one it was merged into, which is read in turn.
  | { screen: "break"; country: string; region: string; slug: string }
  // The app's own screen for a new password, with the token of the mail. A link without one is
  // one that does not work.
  | { screen: "reset-password"; token: string | null }
  // Anything else, which the app opens in the browser inside it.
  | { screen: "browser"; url: string };

/**
 * What an address opens in the app, whatever brought it: a universal link or an App Link, a link
 * of the app's own scheme with the same path (`app.tonnr://b/<id>`), the address a push carries,
 * or a code the camera read. `site` is the web app's origin, which the app is built with: an
 * address of another site opens in the browser. The language of a link changes nothing, and the
 * app keeps the one it was set to. Every address the app ever claimed is read here, since a phone
 * that read an older file of Apple's still opens it.
 */
export function readAppLink(address: string, site: string): AppLink {
  const url = webAddressOf(address, site);
  if (!url) return { screen: "browser", url: address };
  if (url.origin !== new URL(site).origin) return { screen: "browser", url: url.href };
  // The scheme alone opens the app where it opens, on the map: the root of the web app is the
  // landing, which stays in the browser.
  if (address.startsWith(`${APP_SCHEME}:`) && url.pathname === "/") {
    return { screen: "map", search: mapSearchOf(url.searchParams) };
  }
  const segments = segmentsOf(url.pathname);
  return (segments && screenOf(segments, url.searchParams)) ?? { screen: "browser", url: url.href };
}

/** Whether a path is one of the addresses the apps take, in one of its languages. */
export function isClaimedPath(pathname: string) {
  const segments = segmentsOf(pathname);
  if (!segments) return false;
  return APP_LINK_PATHS.some((path) => {
    const template = path.split("/").slice(1);
    return (
      template.length === segments.length &&
      template.every((part, at) =>
        part.startsWith(":") ? segments[at] !== "" : part === segments[at],
      )
    );
  });
}

/**
 * The address of the web app a link names: its scheme's are read against the site. What the
 * scheme is followed by is a path and never a host: the slashes, backslashes and spaces it starts
 * with are dropped, since a URL reads `//`, `/\` or `/<tab>/` as the start of another host.
 */
function webAddressOf(address: string, site: string) {
  const scheme = `${APP_SCHEME}:`;
  const written = address.startsWith(scheme)
    ? `/${address.slice(scheme.length).replace(/^[\s/\\]+/, "")}`
    : address;
  try {
    return new URL(written, site);
  } catch {
    return null;
  }
}

/**
 * The segments of a path without its language, decoded: `/fr/b/a%20b` is `["b", "a b"]`. Null
 * for a path that does not decode.
 */
function segmentsOf(pathname: string) {
  let segments: string[];
  try {
    segments = pathname.split("/").slice(1).map(decodeURIComponent);
  } catch {
    return null;
  }
  const [first] = segments;
  const prefixed = LOCALES.some((locale) => localePrefix(locale) === `/${first}`);
  return prefixed ? segments.slice(1) : segments;
}

function screenOf(segments: string[], query: URLSearchParams): AppLink | undefined {
  const [first, ...rest] = segments;
  const one = rest.length === 1 && rest[0] !== "" ? rest[0] : undefined;
  if (first === "app" && rest.length === 0) return { screen: "map", search: mapSearchOf(query) };
  if (first === "b" && one) return { screen: "map", search: { break: one } };
  if (first === "s" && one) return { screen: "map", search: { station: one } };
  // A shared list opens with the saved panel, where the web's short address leads.
  if (first === "l" && one) return { screen: "map", search: { shared: one, panel: "saved" } };
  if (first === "i" && one) return { screen: "map", search: { invite: one } };
  if (first === "spots" && rest.length === 3 && rest.every((part) => part !== "")) {
    const [country = "", region = "", slug = ""] = rest;
    return { screen: "break", country, region, slug };
  }
  if (first === "reset-password" && rest.length === 0) {
    return { screen: "reset-password", token: query.get("token") || null };
  }
  return undefined;
}

function mapSearchOf(query: URLSearchParams): MapSearch {
  const search: MapSearch = {};
  for (const name of MAP_PARAMETERS) {
    const value = query.get(name);
    if (value !== null) search[name] = value;
  }
  return search;
}
