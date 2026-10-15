import { Link } from "@tanstack/react-router";
import { APP_NAME } from "@repo/config/app";
import { buttonVariants } from "@repo/ui/components/ui/button";
import { cn } from "@repo/ui/lib/utils";

import { m } from "@/paraglide/messages.js";

import {
  AppName,
  InlineLink,
  SECTIONS,
  SectionTitle,
  Tile,
  Woven,
  apart,
  arrive,
  column,
  order,
  useArriving,
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
  const arriving = useArriving<HTMLElement>();
  return (
    <section
      {...arriving}
      aria-labelledby={SECTIONS.story}
      className={`${column} ${apart} group/arrival grid gap-m sm:gap-l lg:grid-cols-12 lg:gap-x-xl`}
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
        className={cn(arrive, "scroll-mt-[calc(var(--space-xxl)*2)] lg:col-span-4")}
      />
      <div className="grid max-w-2xl gap-m lg:col-span-8">
        <p
          style={order(1)}
          className={cn(arrive, "text-l max-sm:text-[1.0625rem] max-sm:leading-[1.5]")}
        >
          {m.landing_story_me()}
        </p>
        <p style={order(2)} className={cn(arrive, "text-neutral-7")}>
          {m.landing_story_origin_before({ name: APP_NAME })}
          <InlineLink href={INSPIRATION.url}>{INSPIRATION.name}</InlineLink>
          {m.landing_story_origin_after()}
        </p>
        <p style={order(3)} className={cn(arrive, "text-neutral-7")}>
          {m.landing_story_feedback()}
        </p>
        <div style={order(4)} className={cn(arrive, "flex flex-wrap items-center gap-m pt-xs")}>
          <Link to="/contact" className={buttonVariants()}>
            {m.landing_story_tell()}
          </Link>
        </div>
      </div>
    </section>
  );
}
