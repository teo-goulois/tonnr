import { APP_NAME } from "@repo/config/app";

import {
  CHARACTERISTIC_FIELDS,
  type ListedField,
  pointName,
} from "@/components/viewer/break-characteristics";
import type { SpotAddress, SpotPage, SpotPlace } from "@/lib/pages-api";
import { SPOTS_ROOT, pageAddress } from "@/lib/public-pages";
import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";

// What the head of a surf break's page and of a hub says, written from the data and from no clock
// or database: decision 057. The components draw the page; this says what a search engine reads.

/**
 * How far the API looks for a buoy around a break, as `packages/api/src/pages.ts` has it: the
 * page says so when none stands within.
 */
export const WAVES_WITHIN_KM = 100;

/** The path of a break's page, before its language. */
export function spotPath({ country, region, slug }: SpotAddress) {
  return `${SPOTS_ROOT}/${country}/${region}/${slug}`;
}

/** The words of one characteristic, as the reader's language says them: for a sentence. */
export function wordsOf(key: ListedField, given: readonly string[] | null): string[] {
  if (!given || given.length === 0) return [];
  if (key === "bestSwellDirections" || key === "bestWindDirections") {
    return CHARACTERISTIC_FIELDS.find((field) => field.key === key)!
      .words.filter(({ word }) => given.includes(word))
      .map(({ word }) => pointName(word as Parameters<typeof pointName>[0]));
  }
  const field = CHARACTERISTIC_FIELDS.find((one) => one.key === key);
  return (
    field?.words.filter(({ word }) => given.includes(word)).map(({ reading }) => reading()) ?? []
  );
}

// The region and the country, as an address reads: "Basque Country, Spain".
function whereOf(places: SpotPlace[]) {
  return places
    .slice(0, 2)
    .reverse()
    .map((place) => place.name)
    .join(", ");
}

/**
 * The description a search engine shows under the title: where the break is, what it is like as
 * far as the catalogue says, and what the page holds. A break of which little is known gets the
 * last sentence alone after its place.
 */
export function spotDescription(page: SpotPage) {
  const { characteristics } = page.break;
  const list = (words: string[]) => words.join(", ");
  const types = wordsOf("breakTypes", characteristics.breakTypes);
  const bottoms = wordsOf("bottomTypes", characteristics.bottomTypes);
  const tides = wordsOf("bestTides", characteristics.bestTides);
  const swell = wordsOf("bestSwellDirections", characteristics.bestSwellDirections);
  const sentences = [
    page.places.length > 0
      ? m.page_meta_place({ name: page.break.name, places: whereOf(page.places) })
      : null,
    types.length > 0 ? m.page_meta_type({ types: list(types) }) : null,
    bottoms.length > 0 ? m.page_meta_bottom({ bottoms: list(bottoms) }) : null,
    tides.length > 0 ? m.page_meta_tides({ tides: list(tides) }) : null,
    swell.length > 0 ? m.page_meta_swell({ swell: list(swell) }) : null,
    m.page_meta_more({ app: APP_NAME }),
  ];
  return sentences.filter((sentence) => sentence !== null).join(" ");
}

/** A step of the path over a page: a place, with the address of its hub when it has one. */
export type Crumb = { name: string; page: string | null };

/** The path over a break's page: the root of the spots, then its places, widest first. */
export function spotCrumbs(page: SpotPage): Crumb[] {
  return [{ name: m.page_spots(), page: SPOTS_ROOT }, ...page.places];
}

/** How many listed spots a hub holds, in words. */
export function spotsCount(count: number) {
  return count === 1 ? m.page_spots_one() : m.page_spots_some({ count });
}

/**
 * The structured data of a path of pages, for a search engine: each place that has a hub, in the
 * reader's language, then the page itself.
 */
export function breadcrumbJsonLd(
  site: string,
  crumbs: Crumb[],
  last: { name: string; page: string },
) {
  const locale = getLocale();
  const steps = [...crumbs.filter((crumb) => crumb.page !== null), last];
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: steps.map((step, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: step.name,
      item: pageAddress(site, step.page!, locale),
    })),
  };
}

/** The structured data of a break's page: the place, with where it is and what it is. */
export function spotJsonLd(site: string, page: SpotPage, path: string) {
  const [country, region] = page.places;
  return [
    {
      "@context": "https://schema.org",
      "@type": "Place",
      name: page.break.name,
      description: spotDescription(page),
      url: pageAddress(site, path, getLocale()),
      geo: {
        "@type": "GeoCoordinates",
        latitude: page.break.latitude,
        longitude: page.break.longitude,
      },
      address: {
        "@type": "PostalAddress",
        ...(country ? { addressCountry: country.name } : {}),
        ...(region ? { addressRegion: region.name } : {}),
      },
    },
    breadcrumbJsonLd(site, spotCrumbs(page), { name: page.break.name, page: path }),
  ];
}

/**
 * A script of structured data for a page's head. `<` is written as an escape, so that nothing in
 * a name closes the script.
 */
export function jsonLdScript(data: unknown) {
  return {
    type: "application/ld+json",
    children: JSON.stringify(data).replaceAll("<", "\\u003c"),
  };
}
