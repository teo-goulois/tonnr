import { Button } from "@repo/ui/components/ui/button";
import { ArrowUpRightIcon, PlayIcon } from "@repo/ui/icon";
import { cn } from "@repo/ui/lib/utils";
import { useEffect, useRef, useState } from "react";

import { EXAMPLE_STATION } from "@/lib/llms";
import { WAVE_HEIGHT_SCALE } from "@/lib/sea-scales";
import { m } from "@/paraglide/messages.js";
import { getLocale, localizeHref } from "@/paraglide/runtime.js";

// The pictures are of the app itself, taken by `scripts/landing-shots.mjs`: one for each theme,
// language and width, since CSS chooses among them and the server knows no width and no theme.
const WIDE = { name: "map", width: 2560, height: 1600 };
const PHONE = { name: "phone", width: 1170, height: 2340 };

// The app is drawn at the size its picture was taken at, then brought to the frame's width: it
// would lay itself out as a phone's in a frame narrower than its wide screen.
const LIVE = { width: 1280, height: 800 };

// The colors of the sea, from a calm one to a heavy one, as a glow behind the frame.
const GLOW = `linear-gradient(90deg, ${WAVE_HEIGHT_SCALE.slice(0, 9)
  .map((stop) => stop.color)
  .join(", ")})`;

function Picture({ shot, theme }: { shot: typeof WIDE; theme: "light" | "dark" }) {
  return (
    <img
      src={`/landing/${shot.name}-${theme}-${getLocale()}.webp`}
      alt={m.landing_shot_alt()}
      width={shot.width}
      height={shot.height}
      // A picture that CSS hides is not asked for: only the one in view is fetched.
      loading="lazy"
      decoding="async"
      className={cn("h-auto w-full", theme === "dark" ? "hidden dark:block" : "dark:hidden")}
    />
  );
}

/**
 * The app as it is: a picture of the map with a buoy's panel, which a wide screen turns into the
 * app itself at a press, in the page. A phone keeps the picture: the app is one press away.
 */
export function LandingDemo() {
  const frame = useRef<HTMLDivElement>(null);
  const [isLive, setLive] = useState(false);
  const [isDrawn, setDrawn] = useState(false);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const element = frame.current;
    if (!element || !isLive) return;
    const fit = () => setScale(element.clientWidth / LIVE.width);
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => observer.disconnect();
  }, [isLive]);

  const stop = () => {
    setLive(false);
    setDrawn(false);
  };

  return (
    <figure className="relative grid gap-s">
      <div
        aria-hidden
        style={{ backgroundImage: GLOW }}
        className="pointer-events-none absolute inset-x-[8%] top-[12%] bottom-[18%] rounded-full opacity-35 blur-3xl dark:opacity-25"
      />
      <div
        ref={frame}
        className="group/demo relative overflow-hidden rounded-(--radius-s) bg-neutral-2 max-sm:mx-auto max-sm:max-w-80"
      >
        <div className="max-sm:hidden">
          <Picture shot={WIDE} theme="light" />
          <Picture shot={WIDE} theme="dark" />
        </div>
        <div className="sm:hidden">
          <Picture shot={PHONE} theme="light" />
          <Picture shot={PHONE} theme="dark" />
        </div>

        {isLive && (
          <iframe
            title={m.landing_demo_title()}
            src={localizeHref(`/app?station=${EXAMPLE_STATION}`)}
            onLoad={() => setDrawn(true)}
            width={LIVE.width}
            height={LIVE.height}
            style={{ scale: String(scale) }}
            className={cn(
              "absolute top-0 left-0 origin-top-left transition-opacity duration-(--motion-large-duration) ease-theme",
              isDrawn ? "opacity-100" : "opacity-0",
            )}
          />
        )}

        {/* The edge is drawn over the picture, which would hide one drawn under it. */}
        <div
          aria-hidden
          className="edge-inset pointer-events-none absolute inset-0 rounded-[inherit]"
        />

        {!isLive && (
          <div className="absolute inset-x-0 bottom-l flex justify-center max-lg:hidden">
            <Button
              onClick={() => setLive(true)}
              className="transition-[scale] duration-(--motion-large-duration) ease-theme group-hover/demo:scale-105 motion-reduce:transition-none"
            >
              <PlayIcon data-slot="icon" aria-hidden />
              {m.landing_demo_start()}
            </Button>
          </div>
        )}
      </div>
      <figcaption className="flex flex-wrap items-center justify-between gap-x-m gap-y-xs text-xs text-neutral-7 max-sm:justify-center max-sm:text-center">
        <span>{m.landing_shot_credits()}</span>
        {isLive && (
          <span className="flex items-center gap-m">
            <button
              type="button"
              onClick={stop}
              className="focus-ring rounded-xs underline underline-offset-2 hover:text-neutral-10"
            >
              {m.landing_demo_stop()}
            </button>
            <a
              href={localizeHref("/app")}
              className="focus-ring inline-flex items-center gap-xxs rounded-xs hover:text-neutral-10"
            >
              {m.landing_open_map()}
              <ArrowUpRightIcon aria-hidden className="size-3" />
            </a>
          </span>
        )}
      </figcaption>
    </figure>
  );
}
