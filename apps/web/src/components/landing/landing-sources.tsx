import { Link } from "@tanstack/react-router";
import { APP_NAME, FEEDBACK_URL, REPOSITORY_URL } from "@repo/config/app";
import { buttonVariants } from "@repo/ui/components/ui/button";
import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  CalendarIcon,
  ClockIcon,
  EarthFillDuoIcon,
  MapIcon,
  PinIcon,
  WaveIcon,
  WindIcon,
} from "@repo/ui/icon";
import { cn } from "@repo/ui/lib/utils";
import type { ReactNode } from "react";

import {
  TIDE_COLOR,
  WAVE_ENERGY_SCALE,
  WAVE_HEIGHT_SCALE,
  WAVE_PERIOD_SCALE,
  WIND_SPEED_SCALE,
  scaleColor,
} from "@/lib/sea-scales";
import { m } from "@/paraglide/messages.js";

import { SECTIONS, SectionTitle, Tile, apart, column, ruled } from "./landing-parts";

const CC_BY = { name: "CC BY 4.0", url: "https://creativecommons.org/licenses/by/4.0/" };
const ETALAB = {
  name: "Etalab 2.0",
  url: "https://www.etalab.gouv.fr/licence-ouverte-open-licence/",
};
const COPERNICUS = {
  name: "Copernicus Marine",
  url: "https://marine.copernicus.eu/user-corner/service-commitments-and-licence",
};
const ODBL = { name: "ODbL 1.0", url: "https://opendatacommons.org/licenses/odbl/" };

// A proper name, written alike in every language, or words that are translated.
type Words = string | (() => string);
const say = (words: Words) => (typeof words === "string" ? words : words());

type Source = {
  /** Where the page of the sources shows it: `/sources#<id>`. */
  id: string;
  name: Words;
  /** Who stands behind the name, when it is not the name itself. */
  by?: Words;
  region: () => string;
  text: () => string;
  /** How often the instance reads it. */
  every?: () => string;
  licence?: { name: Words; url: string };
  site?: string;
};

type Group = {
  id: string;
  name: () => string;
  color: string;
  icon: ReactNode;
  sources: readonly Source[];
};

// What the instance reads, as `apps/worker/src/providers`, `packages/conditions` and the map
// read it: a provider that is added or taken out there is added or taken out here, in the same
// change. The schedules are the worker's.
const GROUPS: readonly Group[] = [
  {
    id: "buoys",
    name: m.sources_group_buoys,
    color: scaleColor(WAVE_HEIGHT_SCALE, 0.5),
    icon: <WaveIcon />,
    sources: [
      {
        id: "candhis",
        name: "CANDHIS",
        by: "Cerema",
        region: m.sources_candhis_region,
        text: m.sources_candhis_text,
        every: () => m.sources_every_minutes({ count: 30 }),
        licence: ETALAB,
        site: "https://candhis.cerema.fr",
      },
      {
        id: "copernicus-in-situ",
        name: "Copernicus Marine",
        by: "In situ",
        region: m.sources_copernicus_in_situ_region,
        text: m.sources_copernicus_in_situ_text,
        every: m.sources_every_hour,
        licence: COPERNICUS,
        site: "https://marine.copernicus.eu",
      },
      {
        id: "ndbc",
        name: "NOAA NDBC",
        by: "National Data Buoy Center",
        region: m.sources_ndbc_region,
        text: m.sources_ndbc_text,
        every: () => m.sources_every_minutes({ count: 10 }),
        licence: {
          name: m.sources_licence_public_domain,
          url: "https://www.weather.gov/disclaimer",
        },
        site: "https://www.ndbc.noaa.gov",
      },
      {
        id: "irish-lights",
        name: "Irish Lights",
        by: "Commissioners of Irish Lights",
        region: m.sources_ireland,
        text: m.sources_irish_lights_text,
        every: m.sources_every_hour,
        licence: CC_BY,
        site: "https://www.irishlights.ie",
      },
      {
        id: "marine-institute",
        name: "Marine Institute",
        by: "Irish Weather Buoy Network",
        region: m.sources_ireland,
        text: m.sources_marine_institute_text,
        every: m.sources_every_hour,
        licence: CC_BY,
        site: "https://www.marine.ie",
      },
      {
        id: "hidrografico",
        name: "Instituto Hidrográfico",
        region: m.sources_hidrografico_region,
        text: m.sources_hidrografico_text,
        every: () => m.sources_every_minutes({ count: 30 }),
        licence: { name: "CC BY-NC 4.0", url: "https://creativecommons.org/licenses/by-nc/4.0/" },
        site: "https://www.hidrografico.pt",
      },
      {
        id: "fmi",
        name: "FMI",
        by: "Finnish Meteorological Institute",
        region: m.sources_fmi_region,
        text: m.sources_fmi_text,
        every: () => m.sources_every_minutes({ count: 30 }),
        licence: CC_BY,
        site: "https://en.ilmatieteenlaitos.fi",
      },
      {
        id: "queensland",
        name: "Queensland Government",
        region: m.sources_queensland_region,
        text: m.sources_queensland_text,
        every: () => m.sources_every_minutes({ count: 30 }),
        licence: CC_BY,
        site: "https://www.qld.gov.au/environment/coasts-waterways/beach/waves",
      },
    ],
  },
  {
    id: "wind",
    name: m.sources_group_wind,
    color: scaleColor(WIND_SPEED_SCALE, 25),
    icon: <WindIcon />,
    sources: [
      {
        id: "meteo-france",
        name: "Météo-France",
        region: m.sources_france,
        text: m.sources_meteo_france_text,
        every: () => m.sources_every_minutes({ count: 6 }),
        licence: ETALAB,
        site: "https://meteofrance.com",
      },
      {
        id: "openwindmap",
        name: "OpenWindMap",
        region: m.sources_openwindmap_region,
        text: m.sources_openwindmap_text,
        every: () => m.sources_every_minutes({ count: 10 }),
        licence: {
          name: m.sources_licence_terms,
          url: "https://developers.pioupiou.fr/data-licensing/",
        },
        site: "https://www.openwindmap.org",
      },
    ],
  },
  {
    id: "forecasts",
    name: m.sources_group_forecasts,
    color: scaleColor(WAVE_PERIOD_SCALE, 13),
    icon: <CalendarIcon />,
    sources: [
      {
        id: "open-meteo",
        name: "Open-Meteo",
        by: "ECMWF, Météo-France",
        region: m.sources_world,
        text: m.sources_open_meteo_text,
        every: () => m.sources_every_hours({ count: 2 }),
        licence: CC_BY,
        site: "https://open-meteo.com",
      },
      {
        id: "copernicus-models",
        name: "Copernicus Marine",
        by: "Met Office, Météo-France",
        region: m.sources_world,
        text: m.sources_copernicus_models_text,
        licence: COPERNICUS,
        site: "https://marine.copernicus.eu",
      },
    ],
  },
  {
    id: "tides",
    name: m.sources_group_tides,
    color: TIDE_COLOR,
    icon: <ClockIcon />,
    sources: [
      {
        id: "neaps",
        name: "Neaps",
        by: "TICON-4, NOAA",
        region: m.sources_world,
        text: m.sources_neaps_text,
        every: m.sources_computed,
        licence: {
          name: m.sources_licence_per_station,
          url: "https://openwaters.io/tides/database",
        },
        site: "https://openwaters.io/tides/database",
      },
    ],
  },
  {
    id: "breaks",
    name: m.sources_group_breaks,
    color: scaleColor(WAVE_ENERGY_SCALE, 2000),
    icon: <PinIcon />,
    sources: [
      {
        id: "catalogue",
        name: () => m.sources_catalogue_name({ name: APP_NAME }),
        region: m.sources_world,
        text: m.sources_catalogue_text,
        licence: ODBL,
      },
    ],
  },
  {
    id: "map",
    name: m.sources_group_map,
    color: scaleColor(WAVE_HEIGHT_SCALE, 1.5),
    icon: <MapIcon />,
    sources: [
      {
        id: "openfreemap",
        name: "OpenFreeMap",
        by: "OpenMapTiles, OpenStreetMap",
        region: m.sources_world,
        text: m.sources_openfreemap_text,
        licence: ODBL,
        site: "https://openfreemap.org",
      },
      {
        id: "photon",
        name: "Photon",
        by: "komoot, OpenStreetMap",
        region: m.sources_world,
        text: m.sources_photon_text,
        licence: ODBL,
        site: "https://photon.komoot.io",
      },
    ],
  },
];

const SOURCES_COLOR = scaleColor(WAVE_HEIGHT_SCALE, 0);

// A tile that stands before a short name, rather than in a line of text.
const bigTile = "mr-0 size-7 translate-y-0 rounded-[0.5rem] [&_svg]:size-4";

function SourcesTitle() {
  return (
    <>
      <Tile color={SOURCES_COLOR}>
        <EarthFillDuoIcon />
      </Tile>
      {m.landing_sources_title()}
    </>
  );
}

/**
 * Where the figures come from, on the landing: each kind of figure, with the names that give it
 * and where they measure, every name leading to its place on the page of the sources.
 */
export function LandingSources() {
  return (
    <section aria-labelledby={SECTIONS.sources} className={`${column} ${apart} grid gap-xl`}>
      <SectionTitle
        id={SECTIONS.sources}
        title={<SourcesTitle />}
        more={m.landing_sources_more({ name: APP_NAME })}
        className="max-w-4xl scroll-mt-[calc(var(--space-xxl)*2)]"
      />
      <div className="grid gap-l">
        <ul className="rounded-(--radius-s) bg-neutral-2 px-m sm:px-l">
          {GROUPS.map((group, index) => (
            <li
              key={group.id}
              className={cn(
                "group/lively grid gap-s py-l lg:grid-cols-12 lg:items-baseline",
                index > 0 && ruled,
              )}
            >
              <h3 className="flex items-center gap-s font-medium lg:col-span-3">
                <Tile color={group.color} className={bigTile}>
                  {group.icon}
                </Tile>
                {group.name()}
              </h3>
              <ul className="flex flex-wrap gap-xs lg:col-span-9">
                {group.sources.map((source) => (
                  <li key={source.id}>
                    <Link
                      to="/sources"
                      hash={source.id}
                      className="focus-ring edge inline-flex max-w-full items-baseline gap-xs rounded-full bg-neutral-1 px-s py-xxs text-s whitespace-nowrap transition-[translate] duration-(--motion-duration) ease-theme hover:-translate-y-0.5 motion-reduce:transition-none"
                    >
                      <span className="font-medium">{say(source.name)}</span>
                      {/* A source of the whole world says nothing by its coverage here. */}
                      {source.region !== m.sources_world && (
                        <span className="min-w-0 truncate text-neutral-7">{source.region()}</span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
        <Link
          to="/sources"
          className={cn(buttonVariants({ variant: "secondary" }), "group/open justify-self-start")}
        >
          {m.landing_sources_all()}
          <ArrowRightIcon
            data-slot="icon"
            aria-hidden
            className="transition-[translate] duration-(--motion-duration) ease-theme group-hover/open:translate-x-0.5 motion-reduce:transition-none"
          />
        </Link>
      </div>
    </section>
  );
}

/** A thing said of a source, under its name: a word that says what it is, and the value. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-xxs">
      <dt className="text-xs text-neutral-7">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

const linked =
  "focus-ring rounded-xs underline decoration-neutral-5 underline-offset-4 transition-[text-decoration-color] duration-(--motion-duration) hover:decoration-neutral-10";

function SourceRow({ source }: { source: Source }) {
  const licence = source.licence;
  return (
    <li
      id={source.id}
      className={`${ruled} grid scroll-mt-[calc(var(--space-xxl)*2)] gap-m py-l lg:grid-cols-12 lg:gap-x-xl`}
    >
      <div className="grid content-start gap-xxs lg:col-span-4">
        <h3 className="font-medium">{say(source.name)}</h3>
        {source.by && <p className="text-s text-neutral-7">{say(source.by)}</p>}
      </div>
      <div className="grid content-start gap-m lg:col-span-8">
        <p className="max-w-2xl">{source.text()}</p>
        <dl className="grid grid-cols-2 gap-m text-s sm:grid-cols-4">
          <Fact label={m.sources_region()}>{source.region()}</Fact>
          {source.every && <Fact label={m.sources_every()}>{source.every()}</Fact>}
          {licence && (
            <Fact label={m.sources_licence()}>
              <a href={licence.url} className={linked}>
                {say(licence.name)}
              </a>
            </Fact>
          )}
          {source.site && (
            <Fact label={m.sources_site()}>
              <a
                href={source.site}
                className={cn(linked, "group inline-flex items-center gap-xxs")}
              >
                {new URL(source.site).hostname}
                <ArrowUpRightIcon
                  aria-hidden
                  className="size-3.5 text-neutral-6 transition-[color,translate] duration-(--motion-duration) ease-theme group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-neutral-10 motion-reduce:transition-none"
                />
              </a>
            </Fact>
          )}
        </dl>
      </div>
    </li>
  );
}

const PRINCIPLES = [
  { name: m.sources_named_name, text: m.sources_named_text },
  { name: m.sources_open_name, text: m.sources_open_text },
  { name: m.sources_kept_name, text: m.sources_kept_text },
] as const;

/**
 * The page of the sources: what the instance holds to, then every source, by the kind of figure
 * it gives, with who it is, where it measures, how often it is read, its licence and its site.
 */
export function SourcesGuide() {
  return (
    <section className={`${column} grid gap-xxl pt-xl lg:pt-xxl`}>
      <div className="grid gap-xl">
        <h1 className="group/lively max-w-4xl text-l font-medium text-balance lg:text-xl">
          <SourcesTitle />
          <span className="text-neutral-7"> {m.sources_page_more({ name: APP_NAME })}</span>
        </h1>
        <ul className="grid gap-m sm:grid-cols-3">
          {PRINCIPLES.map((principle) => (
            <li key={principle.name()} className="grid content-start gap-xxs">
              <h2 className="font-medium">{principle.name()}</h2>
              <p className="text-neutral-7">{principle.text()}</p>
            </li>
          ))}
        </ul>
      </div>

      {GROUPS.map((group) => (
        <section key={group.id} aria-labelledby={`group-${group.id}`} className="grid gap-s">
          <h2
            id={`group-${group.id}`}
            className="group/lively flex items-center gap-s text-l font-medium"
          >
            <Tile color={group.color} className={bigTile}>
              {group.icon}
            </Tile>
            {group.name()}
            <span className="text-neutral-7 tabular-nums">{group.sources.length}</span>
          </h2>
          <ul>
            {group.sources.map((source) => (
              <SourceRow key={source.id} source={source} />
            ))}
          </ul>
        </section>
      ))}

      <div className="grid gap-l rounded-(--radius-s) bg-neutral-2 p-l lg:grid-cols-12 lg:items-center">
        <div className="grid gap-xxs lg:col-span-7">
          <h2 className="font-medium">{m.sources_missing_name()}</h2>
          <p className="text-neutral-7">{m.sources_missing_text()}</p>
        </div>
        <div className="flex flex-wrap gap-xs lg:col-span-5 lg:justify-end">
          <a href={FEEDBACK_URL} className={buttonVariants()}>
            {m.sources_missing_suggest()}
          </a>
          <a
            href={`${REPOSITORY_URL}/blob/main/docs/data-sources.md`}
            className={buttonVariants({ variant: "secondary" })}
          >
            {m.sources_missing_detail()}
          </a>
        </div>
      </div>
    </section>
  );
}
