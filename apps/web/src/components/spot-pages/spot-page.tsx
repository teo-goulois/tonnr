import { Link } from "@tanstack/react-router";
import { buttonVariants } from "@repo/ui/components/ui/button";
import { ArrowRightIcon } from "@repo/ui/icon";
import type { ReactNode } from "react";

import { linked } from "@/components/landing/legal-page";
import { BreakDescription, CharacteristicsList } from "@/components/viewer/break-characteristics";
import type { SpotPage as SpotPageData } from "@/lib/pages-api";
import { placeOnMap } from "@/lib/place-links";
import { spotCrumbs } from "@/lib/spot-pages";
import { m } from "@/paraglide/messages.js";

import { GuideTexts } from "./guide-texts";
import { NearbyBreaks } from "./nearby-breaks";
import { NextTides } from "./next-tides";
import { SeaNow } from "./sea-now";
import { SeaSentence } from "./sea-sentence";
import { Crumbs, SpotFrame, SpotSection } from "./spot-frame";
import { WeekTable } from "./week-table";

// The public page of a surf break: the sea now in a sentence (decision 059), what it is like, the
// sea as the stations measure it, the next tides, the week and the breaks nearby, then the way to
// the map and who the figures come from. Decision 057.

function Credit({ children }: { children: ReactNode }) {
  return <li className="text-s text-neutral-7">{children}</li>;
}

function Licence({ license }: { license: { type: string; url: string } }) {
  return (
    <>
      {" "}
      (
      <a href={license.url} className={linked} rel="license noreferrer" target="_blank">
        {license.type}
      </a>
      )
    </>
  );
}

/** Who measured and computed what the page says: each station, the tides and the models. */
function Sources({ page }: { page: SpotPageData }) {
  const { waves, wind, tide, week } = page;
  const source = page.break.source;
  if (!waves && !wind && !tide && !week && !source.attribution) return null;
  return (
    <SpotSection title={m.page_sources()}>
      <ul className="grid gap-xxs">
        {source.attribution && (
          <Credit>
            {m.page_credit_break({ attribution: source.attribution })}
            {source.license && <Licence license={source.license} />}
          </Credit>
        )}
        {waves && (
          <Credit>
            {m.page_credit_waves({ attribution: waves.attribution })}
            <Licence license={waves.license} />
          </Credit>
        )}
        {wind && (
          <Credit>
            {m.page_credit_wind({ attribution: wind.attribution })}
            <Licence license={wind.license} />
          </Credit>
        )}
        {tide && (
          <Credit>
            {m.page_credit_tides()}{" "}
            <a href={tide.station.source.url} className={linked} rel="noreferrer" target="_blank">
              {tide.station.source.name}
            </a>
            <Licence license={tide.station.license} />
          </Credit>
        )}
        {week && (
          <Credit>
            {m.page_credit_forecast()}{" "}
            {week.source.credits.map((credit, index) => (
              <span key={credit.url}>
                {index > 0 && ", "}
                <a href={credit.url} className={linked} rel="noreferrer" target="_blank">
                  {credit.text}
                </a>
              </span>
            ))}
            <Licence license={week.source.license} />
            {week.source.notice && <span className="block">{week.source.notice}</span>}
          </Credit>
        )}
      </ul>
    </SpotSection>
  );
}

/** The page of one surf break, as the server renders it and the browser takes it over. */
export function SpotPage({ page, now }: { page: SpotPageData; now: number }) {
  const found = page.break;
  return (
    <SpotFrame>
      <header className="grid gap-s">
        <Crumbs crumbs={spotCrumbs(page)} />
        <h1 className="text-xl font-bold text-balance sm:text-xxl">{found.name}</h1>
        <BreakDescription description={found.description} />
      </header>

      <SeaSentence page={page} />

      {/* The places are the path over the title: the list leaves them out. */}
      <CharacteristicsList known={found.characteristics} title={m.break_about()} />
      <GuideTexts texts={page.texts} />

      <SeaNow waves={page.waves} wind={page.wind} now={now} />
      <NextTides tide={page.tide} timezone={found.timezone} />
      <WeekTable week={page.week} now={now} />
      <NearbyBreaks nearby={page.nearby} />

      <div>
        <Link {...placeOnMap("break", found.id)} className={`${buttonVariants()} group/open`}>
          {m.page_open_on_map()}
          <ArrowRightIcon
            data-slot="icon"
            aria-hidden
            className="transition-[translate] duration-(--motion-duration) ease-theme group-hover/open:translate-x-0.5 motion-reduce:transition-none"
          />
        </Link>
      </div>

      <Sources page={page} />
    </SpotFrame>
  );
}
