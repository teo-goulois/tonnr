import { type Locale, localePrefix } from "@repo/config/locales";

import type { PlaceRef } from "@/components/saved/sea-now";

// The addresses the app sends a list and a place by: the web app's short ones, which open the
// app where it is installed and the map anywhere else (decisions 035, 056 and 073), written in
// the language of whoever sends them, as the web writes them. A module that reads no React and
// no phone, so that a test reads it.

const siteOf = (site: string) => site.replace(/\/+$/, "");

/** The address a shared list is sent by: `/l/<token>`. */
export function listLinkOf(site: string, locale: Locale, token: string) {
  return `${siteOf(site)}${localePrefix(locale)}/l/${token}`;
}

/**
 * The address a surf break or a station is sent by: `/b/<id>` or `/s/<id>`. A spot of an
 * account's own has none: it is sent in a shared list (decision 056).
 */
export function placeLinkOf(site: string, locale: Locale, place: PlaceRef) {
  if (place.kind === "spot") return null;
  const path = place.kind === "break" ? "b" : "s";
  return `${siteOf(site)}${localePrefix(locale)}/${path}/${encodeURIComponent(place.id)}`;
}

/**
 * What the API is told of a list's link by whoever reads it with it, in `Authorization`: the
 * link, and what stands for its password once it was given (decision 035).
 */
export function linkAuthorizationOf(token: string, pass: string | null) {
  return `List ${token}${pass ? `.${pass}` : ""}`;
}

/** What a list's link ends with, as the API makes it: sixteen random bytes in base64url. */
const TOKEN = /^[A-Za-z0-9_-]{1,64}$/;

/** Whether a link's end can be a list's, before anything is asked or kept under it. */
export function isListToken(token: string | undefined): token is string {
  return token !== undefined && TOKEN.test(token);
}
