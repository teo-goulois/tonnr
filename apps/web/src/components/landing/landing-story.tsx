import { FEEDBACK_URL, REPOSITORY_URL } from "@repo/config/app";
import { buttonVariants } from "@repo/ui/components/ui/button";

import { m } from "@/paraglide/messages.js";

import { SECTIONS, SectionTitle, apart, column } from "./landing-parts";

// The app the project began from, which its maker thanks by name.
const INSPIRATION = { name: "La Bouée", url: "https://labouee.app" };
const AUTHOR = "Téo Goulois";

/** Who makes the product, where it comes from, and what he asks of whoever uses it. */
export function LandingStory() {
  return (
    <section
      aria-labelledby={SECTIONS.story}
      className={`${column} ${apart} grid gap-l lg:grid-cols-12 lg:gap-x-xl`}
    >
      <SectionTitle
        id={SECTIONS.story}
        title={m.landing_story_title()}
        className="scroll-mt-xl lg:col-span-4"
      />
      <div className="grid max-w-2xl gap-m lg:col-span-8">
        <p className="text-l">{m.landing_story_me()}</p>
        <p className="text-neutral-7">
          {m.landing_story_origin_before()}
          <a
            href={INSPIRATION.url}
            className="focus-ring rounded-xs text-neutral-10 underline underline-offset-4"
          >
            {INSPIRATION.name}
          </a>
          {m.landing_story_origin_after()}
        </p>
        <p className="text-neutral-7">{m.landing_story_feedback()}</p>
        <p className="font-medium">{AUTHOR}</p>
        <div className="flex flex-wrap gap-xs pt-xs">
          <a href={FEEDBACK_URL} className={buttonVariants()}>
            {m.landing_story_tell()}
          </a>
          <a href={REPOSITORY_URL} className={buttonVariants({ variant: "outline" })}>
            {m.landing_story_code()}
          </a>
        </div>
      </div>
    </section>
  );
}
