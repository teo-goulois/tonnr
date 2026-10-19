import { afterEach, describe, expect, it, vi } from "vitest";

import { Route as PlaceLink } from "@/routes/b.$id";
import { Route as InviteLink } from "@/routes/i.$token";
import { Route as ListLink } from "@/routes/l.$token";
import { Route as StationLink } from "@/routes/s.$id";
import { Route as SpotRoute } from "@/routes/spots/$country/$region/$slug";

import { appBanner } from "./app-banner";
import type { SpotPage } from "./pages-api";
import { pageMeta } from "./public-pages";

// Safari's banner, which offers the app on the pages a link is sent to: decision 073.

// The id of the App Store the stage names, which a build reads: none unless a test sets it.
const stage = vi.hoisted(() => ({ storeId: undefined as string | undefined }));
vi.mock("../env.public", async (original) => {
  const { ENV } = await original<typeof import("../env.public")>();
  return {
    ENV: {
      ...ENV,
      get VITE_APP_STORE_ID() {
        return stage.storeId;
      },
    },
  };
});

const site = "https://site.example";
const STORE = "1234567890";

// An invented break, of which only the place is known.
const spot: SpotPage = {
  moved: false,
  reports: [],
  break: {
    id: "6e0d6c0a-0000-4000-8000-000000000002",
    name: "Anse du Phare",
    latitude: 47.8,
    longitude: -4.38,
    characteristics: {
      breakTypes: null,
      waveDirections: null,
      bottomTypes: null,
      abilityLevels: null,
      boardTypes: null,
      bestSeasons: null,
      bestTides: null,
      bestSwellDirections: null,
      bestWindDirections: null,
      sizeFactors: null,
      offshoreDirectionDegrees: null,
      waveSizeMeters: null,
    },
    location: ["France", "Bretagne", "Plomeur"],
    timezone: "Europe/Paris",
    page: "/spots/france/bretagne/anse-du-phare",
    description: null,
    source: { provider: null, url: null, attribution: null, license: null },
  },
  listed: true,
  places: [
    { name: "France", page: "/spots/france" },
    { name: "Bretagne", page: "/spots/france/bretagne" },
    { name: "Plomeur", page: null },
  ],
  waves: null,
  wind: null,
  tide: null,
  week: null,
  texts: [],
  nearby: [],
};

type Meta = { name?: string; content?: string }[];
type Head = (context: unknown) => { meta?: Meta };

/** The head each page a link is sent to writes, read once it has loaded. */
function heads() {
  const headOf = (route: { options: { head?: unknown } }, context: unknown) =>
    (route.options.head as Head)(context).meta ?? [];
  return [
    {
      address: `${site}/b/b-1`,
      meta: headOf(PlaceLink, { loaderData: { site, name: "La Torche" }, params: { id: "b-1" } }),
    },
    {
      address: `${site}/s/62001`,
      meta: headOf(StationLink, { loaderData: { site, name: "Brest" }, params: { id: "62001" } }),
    },
    {
      address: `${site}/l/the-token`,
      meta: headOf(ListLink, { loaderData: { site, list: null }, params: { token: "the-token" } }),
    },
    {
      address: `${site}/i/the-token`,
      meta: headOf(InviteLink, {
        loaderData: { site, username: "ana" },
        params: { token: "the-token" },
      }),
    },
    {
      address: `${site}/spots/france/bretagne/anse-du-phare`,
      meta: headOf(SpotRoute, {
        loaderData: { site, now: 0, closed: false, data: spot },
        params: { country: "france", region: "bretagne", slug: "anse-du-phare" },
      }),
    },
  ];
}

const bannerOf = (meta: Meta) => meta.filter((one) => one.name === "apple-itunes-app");

describe("appBanner", () => {
  it("names the app and the page's address once the stage names the app's id", () => {
    expect(appBanner(`${site}/b/b-1`, STORE)).toEqual([
      { name: "apple-itunes-app", content: `app-id=${STORE}, app-argument=${site}/b/b-1` },
    ]);
  });

  it("says nothing while the stage names none", () => {
    expect(appBanner(`${site}/b/b-1`, undefined)).toEqual([]);
    expect(appBanner(`${site}/b/b-1`, "")).toEqual([]);
  });
});

describe("the pages a link is sent to", () => {
  afterEach(() => {
    stage.storeId = undefined;
  });

  it("carry the banner, each with its own address, once the stage names the app's id", () => {
    stage.storeId = STORE;
    for (const { address, meta } of heads()) {
      expect(bannerOf(meta), address).toEqual(appBanner(address, STORE));
    }
  });

  it("carry none while the stage names no id", () => {
    for (const { address, meta } of heads()) {
      expect(bannerOf(meta), address).toEqual([]);
    }
  });

  it("are the only ones: the landing and the other public pages carry none", () => {
    stage.storeId = STORE;
    expect(bannerOf(pageMeta(site, "/", { title: "Tonnr", description: "The sea." }))).toEqual([]);
  });
});
