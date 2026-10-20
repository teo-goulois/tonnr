// The short address of a surf break or a station on the web app's site, which opens the map on
// its panel, in the reader's language: `/b/<id>` and `/s/<id>`, under the language's prefix,
// none for the base language's. The web's `placeLink` (`share-place.tsx`). Decision 056. Pure,
// so that a test reads it.

/** What a link may open: a surf break of the catalogue or a station, which anyone reads. */
export type SharedPlace = { breakId: string } | { stationId: string };

export function placeLink(
  place: SharedPlace,
  { site, locale, baseLocale }: { site: string; locale: string; baseLocale: string },
) {
  const path =
    "breakId" in place
      ? `/b/${encodeURIComponent(place.breakId)}`
      : `/s/${encodeURIComponent(place.stationId)}`;
  return siteLink(path, { site, locale, baseLocale });
}

/** A page of the web app's site in the reader's language, as `/terms` or `/privacy`. */
export function siteLink(
  path: string,
  { site, locale, baseLocale }: { site: string; locale: string; baseLocale: string },
) {
  return new URL(`${locale === baseLocale ? "" : `/${locale}`}${path}`, site).href;
}

/**
 * What the platform's share sheet is given: iOS takes the address apart and shows it as a link,
 * Android takes one text, which ends with it.
 */
export function shareContent(
  { title, text, url }: { title: string; text: string; url: string },
  platform: "ios" | "android" | string,
) {
  return platform === "ios" ? { title, message: text, url } : { title, message: `${text} ${url}` };
}
