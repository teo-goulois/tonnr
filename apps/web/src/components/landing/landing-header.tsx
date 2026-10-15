import { Link } from "@tanstack/react-router";
import { APP_NAME } from "@repo/config/app";
import { buttonVariants } from "@repo/ui/components/ui/button";
import { cn } from "@repo/ui/lib/utils";
import { type PointerEvent, useEffect, useState } from "react";

import { m } from "@/paraglide/messages.js";

import { SECTIONS, column } from "./landing-parts";

const LINKS = [
  { hash: SECTIONS.features, label: m.landing_nav_features },
  { hash: SECTIONS.story, label: m.landing_nav_story },
  { hash: SECTIONS.next, label: m.landing_nav_next },
  { hash: SECTIONS.sources, label: m.landing_nav_sources },
  { hash: SECTIONS.agents, label: m.landing_nav_agents },
] as const;

// Past this many pixels the page has left its top, and the bar gathers into a pill.
const GATHERED_AFTER = 24;
// Past this many, scrolling down puts the bar away, and scrolling up brings it back. A move of
// fewer pixels than the step is a trackpad's tremor, and changes nothing.
const HIDDEN_AFTER = 160;
const SCROLL_STEP = 6;

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
          className="focus-ring relative rounded-full px-m py-xs font-medium tracking-[-0.01em] text-neutral-8 transition-colors duration-(--motion-duration) hover:text-neutral-10"
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
 * page is scrolled, as the app's own header floats on its map. Over a top that holds the way in
 * already, `wayInBelow` keeps its own until the page is scrolled, so that the two do not stand
 * side by side.
 */
export function LandingHeader({ wayInBelow = false }: { wayInBelow?: boolean }) {
  const [isGathered, setGathered] = useState(false);
  const [isAway, setAway] = useState(false);

  useEffect(() => {
    let last = window.scrollY;
    const read = () => {
      const y = window.scrollY;
      setGathered(y > GATHERED_AFTER);
      if (Math.abs(y - last) < SCROLL_STEP) return;
      setAway(y > last && y > HIDDEN_AFTER);
      last = y;
    };
    read();
    window.addEventListener("scroll", read, { passive: true });
    return () => window.removeEventListener("scroll", read);
  }, []);

  return (
    // A bar that is away comes back as soon as a key brings the focus into it.
    <header
      className={cn(
        "pointer-events-none sticky top-0 z-40 pt-m transition-[translate] duration-(--motion-large-duration) ease-theme focus-within:translate-y-0 motion-reduce:transition-none",
        // Its shadow reaches below it: it goes up by that much more.
        isAway && "-translate-y-[calc(100%+3rem)]",
      )}
    >
      <div className={column}>
        <div
          className={cn(
            "pointer-events-auto mx-auto flex h-14 items-center lg:h-16 justify-between gap-m rounded-full transition-[max-width,padding,background-color,box-shadow] duration-(--motion-large-duration) ease-theme motion-reduce:transition-none",
            // Gathered, it is drawn crisp on the page's own background: a fine edge, a light that
            // catches its top, and a soft shadow that lifts it off the page.
            isGathered
              ? "edge max-w-[60rem] bg-background pr-xs pl-l [--edge-color:rgb(0_0_0/0.07)] [--edge-elevation:inset_0_1px_0_rgb(255_255_255/0.6),0_1px_2px_rgb(0_0_0/0.04),0_12px_32px_-12px_rgb(0_0_0/0.18)] dark:[--edge-color:rgb(255_255_255/0.1)] dark:[--edge-elevation:inset_0_1px_0_rgb(255_255_255/0.06),0_12px_32px_-12px_rgb(0_0_0/0.6)]"
              : "max-w-full [--edge-color:transparent]",
          )}
        >
          <Link
            to="/"
            className="group/lively focus-ring flex items-center gap-xs rounded-full font-bold tracking-[-0.02em] lg:text-l"
          >
            <img
              src="/favicon.svg"
              alt=""
              width={28}
              height={28}
              className="size-6 transition-[rotate,scale] lg:size-7 duration-200 ease-out group-hover/lively:-rotate-6 group-hover/lively:scale-110 motion-reduce:transition-none"
            />
            {APP_NAME}
          </Link>
          <Links />
          <Link
            to="/app"
            inert={wayInBelow && !isGathered}
            className={cn(
              buttonVariants(),
              "h-10 rounded-full px-m text-s transition-opacity duration-(--motion-large-duration) ease-theme lg:h-11 lg:px-l lg:text-m motion-reduce:transition-none",
              wayInBelow && !isGathered && "opacity-0",
            )}
          >
            {m.landing_open_map()}
          </Link>
        </div>
      </div>
    </header>
  );
}
