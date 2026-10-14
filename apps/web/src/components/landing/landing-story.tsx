import { FEEDBACK_URL } from "@repo/config/app";
import { buttonVariants } from "@repo/ui/components/ui/button";

import { m } from "@/paraglide/messages.js";

import {
  AppName,
  InlineLink,
  SECTIONS,
  SectionTitle,
  Tile,
  Woven,
  apart,
  column,
} from "./landing-parts";

// The app the project began from, which its maker thanks by name.
const INSPIRATION = { name: "La Bouée", url: "https://labouee.app" };
/** Who makes the product, and where more is said of him. */
export const AUTHOR = {
  name: "Téo Goulois",
  url: "https://teogoulois.com",
  portrait: "/landing/teo.webp",
};

/** Who makes the product, where it comes from, and what he asks of whoever uses it. */
export function LandingStory() {
  return (
    <section
      aria-labelledby={SECTIONS.story}
      className={`${column} ${apart} grid gap-l lg:grid-cols-12 lg:gap-x-xl`}
    >
      <SectionTitle
        id={SECTIONS.story}
        title={
          <Woven
            say={m.landing_story_title}
            words={{
              me: (
                <>
                  <Tile className="rounded-full">
                    <img src={AUTHOR.portrait} alt="" />
                  </Tile>
                  {m.landing_story_word()}
                </>
              ),
              name: <AppName />,
            }}
          />
        }
        className="scroll-mt-[calc(var(--space-xxl)*2)] lg:col-span-4"
      />
      <div className="grid max-w-2xl gap-m lg:col-span-8">
        <p className="text-l">{m.landing_story_me()}</p>
        <p className="text-neutral-7">
          {m.landing_story_origin_before()}
          <InlineLink href={INSPIRATION.url}>{INSPIRATION.name}</InlineLink>
          {m.landing_story_origin_after()}
        </p>
        <p className="text-neutral-7">{m.landing_story_feedback()}</p>
        <div className="flex flex-wrap items-center gap-m pt-xs">
          <a href={FEEDBACK_URL} className={buttonVariants()}>
            {m.landing_story_tell()}
          </a>
          <InlineLink
            href={AUTHOR.url}
            icon={
              <Tile className="rounded-full [--tile:--spacing(5)]">
                <img src={AUTHOR.portrait} alt="" />
              </Tile>
            }
          >
            {m.landing_story_site()}
          </InlineLink>
        </div>
      </div>
    </section>
  );
}
