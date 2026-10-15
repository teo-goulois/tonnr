import type { ReactNode } from "react";

import type { Countries, Country, Region } from "@/lib/pages-api";
import { SPOTS_ROOT } from "@/lib/public-pages";
import { type Crumb, spotsCount } from "@/lib/spot-pages";
import { m } from "@/paraglide/messages.js";

import { BreakRow, breakLine } from "./nearby-breaks";
import { Crumbs, SpotFrame } from "./spot-frame";

// The hubs over the pages of the surf breaks: the countries, the regions of a country, and the
// listed breaks of a region, each a page a search engine follows from the landing to a break.
// The places are named in English, as the catalogue holds them: decision 057.

function Hub({ crumbs, title, children }: { crumbs: Crumb[]; title: string; children: ReactNode }) {
  return (
    <SpotFrame>
      <header className="grid gap-s">
        <Crumbs crumbs={crumbs} />
        <h1 className="text-xl font-bold text-balance sm:text-xxl">{title}</h1>
      </header>
      {children}
    </SpotFrame>
  );
}

const root = (): Crumb => ({ name: m.page_spots(), page: SPOTS_ROOT });

/** Every country that holds a listed break, with how many. */
export function CountriesHub({ countries }: { countries: Countries }) {
  return (
    <Hub crumbs={[{ name: m.page_spots(), page: null }]} title={m.page_countries_title()}>
      <ul className="grid gap-xxs sm:grid-cols-2">
        {countries.countries.map((country) => (
          <BreakRow
            key={country.country}
            page={country.page}
            name={country.name}
            line=""
            aside={spotsCount(country.listed)}
          />
        ))}
      </ul>
    </Hub>
  );
}

/** The regions of a country that hold a listed break, with how many. */
export function CountryHub({ country }: { country: Country }) {
  return (
    <Hub
      crumbs={[root(), { name: country.name, page: null }]}
      title={m.page_hub_title({ name: country.name })}
    >
      <ul className="grid gap-xxs sm:grid-cols-2">
        {country.regions.map((region) => (
          <BreakRow
            key={region.region}
            page={region.page}
            name={region.name}
            line=""
            aside={spotsCount(region.listed)}
          />
        ))}
      </ul>
    </Hub>
  );
}

/** The listed breaks of a region, by name, each with a line on what it is like. */
export function RegionHub({ region }: { region: Region }) {
  return (
    <Hub
      crumbs={[
        root(),
        { name: region.country.name, page: region.country.page },
        { name: region.name, page: null },
      ]}
      title={m.page_hub_title({ name: region.name })}
    >
      <ul className="grid gap-xxs">
        {region.breaks.map((found) => (
          <BreakRow
            key={found.id}
            page={found.page}
            name={found.name}
            line={breakLine(found.characteristics)}
          />
        ))}
      </ul>
    </Hub>
  );
}
