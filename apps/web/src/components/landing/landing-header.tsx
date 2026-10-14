import { Link } from "@tanstack/react-router";
import { APP_NAME } from "@repo/config/app";
import { buttonVariants } from "@repo/ui/components/ui/button";
import { cn } from "@repo/ui/lib/utils";
import { type PointerEvent, useEffect, useState } from "react";

import { m } from "@/paraglide/messages.js";

import { SECTIONS, column } from "./landing-parts";

const LINKS = [
  { hash: SECTIONS.features, label: m.landing_nav_features },
  { hash: SECTIONS.agents, label: m.landing_nav_agents },
  { hash: SECTIONS.story, label: m.landing_nav_story },
  { hash: SECTIONS.next, label: m.landing_nav_next },
] as const;

// Past this many pixels the page has left its top, and the bar gathers into a pill.
const GATHERED_AFTER = 24;

/** The links of the bar, with one highlight that slides to whichever the pointer is on. */
function Links() {
  const [under, setUnder] = useState<{ left: number; width: number } | null>(null);
  // The highlight keeps its last place while it fades, so that it does not slide away.
  const [last, setLast] = useState({ left: 0, width: 0 });

  const point = (event: PointerEvent<HTMLAnchorElement>) => {
    const place = { left: event.currentTarget.offsetLeft, width: event.currentTarget.offsetWidth };
    setUnder(place);
    setLast(place);
  };

  return (
    <nav
      aria-label={m.landing_nav_label()}
      className="relative flex items-center max-lg:hidden"
      onPointerLeave={() => setUnder(null)}
    >
      <span
        aria-hidden
        style={{ translate: `${last.left}px 0`, width: last.width }}
        className={cn(
          "pointer-events-none absolute inset-y-0 left-0 rounded-full bg-neutral-3 transition-[translate,width,opacity] duration-(--motion-large-duration) ease-theme motion-reduce:transition-none",
          under ? "opacity-100" : "opacity-0",
        )}
      />
      {LINKS.map((link) => (
        <Link
          key={link.hash}
          to="/"
          hash={link.hash}
          onPointerEnter={point}
          onFocus={(event) =>
            setLast({
              left: event.currentTarget.offsetLeft,
              width: event.currentTarget.offsetWidth,
            })
          }
          className="focus-ring relative rounded-full px-s py-xs text-s font-medium text-neutral-8 transition-colors duration-(--motion-duration) hover:text-neutral-10"
        >
          {link.label()}
        </Link>
      ))}
    </nav>
  );
}

/**
 * The bar of the landing and of the pages beside it: the name, where the page leads, and the way
 * into the app. It lies flat at the top of a page, and gathers into a pill that floats once the
 * page is scrolled, as the app's own header floats on its map.
 */
export function LandingHeader() {
  const [isGathered, setGathered] = useState(false);

  useEffect(() => {
    const read = () => setGathered(window.scrollY > GATHERED_AFTER);
    read();
    window.addEventListener("scroll", read, { passive: true });
    return () => window.removeEventListener("scroll", read);
  }, []);

  return (
    <header className="pointer-events-none sticky top-0 z-40 pt-s">
      <div className={column}>
        <div
          className={cn(
            "pointer-events-auto mx-auto flex items-center justify-between gap-m rounded-full py-xxs transition-[max-width,padding,background-color,box-shadow] duration-(--motion-large-duration) ease-theme motion-reduce:transition-none",
            isGathered
              ? "edge max-w-2xl bg-neutral-1/80 pr-xxs pl-m backdrop-blur-md"
              : "max-w-full [--edge-color:transparent]",
          )}
        >
          <Link
            to="/"
            className="group/lively focus-ring flex items-center gap-xs rounded-full font-bold"
          >
            <img
              src="/favicon.svg"
              alt=""
              width={20}
              height={20}
              className="size-5 transition-[rotate,scale] duration-200 ease-out group-hover/lively:-rotate-6 group-hover/lively:scale-110 motion-reduce:transition-none"
            />
            {APP_NAME}
          </Link>
          <Links />
          <Link to="/app" className={buttonVariants({ size: "sm" })}>
            {m.landing_open_map()}
          </Link>
        </div>
      </div>
    </header>
  );
}
