import { APP_NAME } from "@repo/config/app";

import { SHARED_PICTURE, placePicturePath } from "@/lib/public-pages";
import { apiOrigin } from "@/lib/site";
import { m } from "@/paraglide/messages.js";
import { getLocale, localizeHref } from "@/paraglide/runtime.js";

import { ENV } from "../env.public";

/** What a short address opens: a surf break of the catalogue, or a station. */
export type PlaceKind = "break" | "station";

const PATHS: Record<PlaceKind, { short: string; api: string }> = {
  break: { short: "/b", api: "/v1/breaks" },
  station: { short: "/s", api: "/v1/stations" },
};

/** Where a browser goes on to: the map, on the panel of what was sent. */
export function placeOnMap(kind: PlaceKind, id: string) {
  return {
    to: "/app",
    search: kind === "break" ? { break: id } : { station: id },
  } as const;
}

/**
 * The name of what was sent, for the title of the link, which the API answers whoever has the
 * address, even while the instance is closed to visitors: decision 056. A link is still shown,
 * with no name, when the API answers nothing.
 */
export async function placeNameOf(kind: PlaceKind, id: string): Promise<string | null> {
  try {
    const response = await fetch(
      `${apiOrigin(ENV.VITE_SERVER_URL)}${PATHS[kind].api}/${encodeURIComponent(id)}/name`,
      { signal: AbortSignal.timeout(3000) },
    );
    if (!response.ok) return null;
    const place = (await response.json()) as { name?: unknown };
    return typeof place.name === "string" ? place.name : null;
  } catch {
    return null;
  }
}

/** What a short address says of itself to the sites a link is sent through. */
export function placeHead(site: string, kind: PlaceKind, id: string, name: string | null) {
  const locale = getLocale();
  const title = name ? m.place_share_text({ name, app: APP_NAME }) : m.place_picture_title();
  const description = m.place_picture_text();
  const address = `${site}${localizeHref(`${PATHS[kind].short}/${id}`, { locale })}`;
  return {
    meta: [
      { title },
      { name: "description", content: description },
      // The map is the page to list, not the address that leads there.
      { name: "robots", content: "noindex" },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: APP_NAME },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:url", content: address },
      { property: "og:image", content: `${site}${placePicturePath(locale)}` },
      { property: "og:image:width", content: String(SHARED_PICTURE.width) },
      { property: "og:image:height", content: String(SHARED_PICTURE.height) },
      { property: "og:image:alt", content: m.place_picture_alt({ name: APP_NAME }) },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  };
}
