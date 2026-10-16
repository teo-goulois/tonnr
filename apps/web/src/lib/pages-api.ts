import type { AppRouterClient } from "@repo/api/routers/index";

import { apiOrigin } from "@/lib/site";

import { ENV } from "../env.public";

// What the public pages of the surf breaks read from the API, and nothing else: one call a page,
// as a visitor, with the site named in `Origin` so that the API knows the web app (decisions 039
// and 057). The server renders a page from these; a browser that comes to a page by a link of
// another runs the same loader, and names its origin itself.

type Pages = AppRouterClient["v1"]["pages"];
type Answer<Procedure extends (...input: never[]) => unknown> = Awaited<ReturnType<Procedure>>;

/** The page of a break, or that its address moved to another break's. */
export type SpotPageAnswer = Answer<Pages["break"]>;
export type SpotPage = Extract<SpotPageAnswer, { moved: false }>;
export type MovedPage = Extract<SpotPageAnswer, { moved: true }>;
export type SpotPlace = SpotPage["places"][number];
export type NearStation = NonNullable<SpotPage["waves"]>;
export type NearWind = NonNullable<SpotPage["wind"]>;
export type SpotTide = NonNullable<SpotPage["tide"]>;
export type SpotWeek = NonNullable<SpotPage["week"]>;
export type NearbyBreak = SpotPage["nearby"][number];
/** The hubs: the countries, the regions of one, and the listed breaks of one region. */
export type Countries = Answer<Pages["countries"]>;
export type Country = Answer<Pages["country"]>;
export type Region = Answer<Pages["region"]>;
export type ListedBreak = Region["breaks"][number];
/** What a sitemap names: every hub, and the listed breaks by pages of two thousand. */
export type Hubs = Answer<Pages["hubs"]>;
export type Listed = Answer<Pages["listed"]>;

/** An answer as it travels over HTTP: a date is an ISO string there. */
export type Json<T> = T extends Date
  ? string
  : T extends (infer Item)[]
    ? Json<Item>[]
    : T extends object
      ? { [Key in keyof T]: Json<T[Key]> }
      : T;

/** The API answered that there is no page at this address. */
export class NoPage extends Error {
  constructor() {
    super("No page at this address.");
  }
}

/** The API refused a visitor: the instance is closed to them for now (decision 039). */
export class ClosedToVisitors extends Error {
  constructor() {
    super("The instance is closed to visitors.");
  }
}

/** The API did not answer, or answered something else. */
export class PagesUnavailable extends Error {
  constructor(readonly status: number | null) {
    super(status === null ? "The API did not answer." : `The API answered ${status}.`);
  }
}

/** The address of a break's page in the web app, and the hub pages over it. */
export type SpotAddress = { country: string; region: string; slug: string };

const TIMEOUT_MS = 5000;

/**
 * One call of the API as a visitor. Only the server names the site in `Origin`: a browser sets
 * the header itself, and refuses to have it set.
 */
async function ask(path: string, site: string): Promise<unknown> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (typeof window === "undefined") headers.Origin = site;
  let response: Response;
  try {
    response = await fetch(`${apiOrigin(ENV.VITE_SERVER_URL)}/v1${path}`, {
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new PagesUnavailable(null);
  }
  if (response.status === 404) throw new NoPage();
  if (response.status === 401) throw new ClosedToVisitors();
  if (!response.ok) throw new PagesUnavailable(response.status);
  return response.json();
}

const date = (value: string) => new Date(value);
const part = (value: string) => encodeURIComponent(value);

/** The page of a break, with its dates read back. */
export async function fetchSpotPage(address: SpotAddress, site: string): Promise<SpotPageAnswer> {
  const raw = (await ask(
    `/pages/breaks/${part(address.country)}/${part(address.region)}/${part(address.slug)}`,
    site,
  )) as Json<SpotPageAnswer>;
  if (raw.moved) return raw;
  return {
    ...raw,
    waves: raw.waves && {
      ...raw.waves,
      latestReading: {
        ...raw.waves.latestReading,
        observedAt: date(raw.waves.latestReading.observedAt),
      },
    },
    wind: raw.wind && {
      ...raw.wind,
      latestReading: {
        ...raw.wind.latestReading,
        observedAt: date(raw.wind.latestReading.observedAt),
      },
    },
    tide: raw.tide && {
      ...raw.tide,
      extremes: raw.tide.extremes.map((extreme) => ({ ...extreme, time: date(extreme.time) })),
    },
    week: raw.week && {
      ...raw.week,
      fetchedAt: date(raw.week.fetchedAt),
      now: raw.week.now && {
        ...raw.week.now,
        hour: { ...raw.week.now.hour, time: date(raw.week.now.hour.time) },
      },
      days: raw.week.days.map((day) => ({
        ...day,
        wave: day.wave && { ...day.wave, time: date(day.wave.time) },
        wind: day.wind && { ...day.wind, time: date(day.wind.time) },
      })),
    },
  };
}

export function fetchCountries(site: string) {
  return ask("/pages/places", site) as Promise<Countries>;
}

export function fetchCountry(country: string, site: string) {
  return ask(`/pages/places/${part(country)}`, site) as Promise<Country>;
}

export function fetchRegion(country: string, region: string, site: string) {
  return ask(`/pages/places/${part(country)}/${part(region)}`, site) as Promise<Region>;
}

export async function fetchHubs(site: string): Promise<Hubs> {
  const raw = (await ask("/pages/hubs", site)) as Json<Hubs>;
  return { hubs: raw.hubs.map((hub) => ({ ...hub, updatedAt: date(hub.updatedAt) })) };
}

export async function fetchListed(page: number, site: string): Promise<Listed> {
  const raw = (await ask(`/pages/breaks?page=${page}`, site)) as Json<Listed>;
  return {
    pages: raw.pages,
    breaks: raw.breaks.map((found) => ({ ...found, updatedAt: date(found.updatedAt) })),
  };
}
