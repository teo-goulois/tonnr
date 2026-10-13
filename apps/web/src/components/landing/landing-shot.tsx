import { cn } from "@repo/ui/lib/utils";

import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";

// The pictures are of the deployed app, taken by `scripts/landing-shots.mjs`: one for each theme,
// language and width, since CSS chooses among them and the server knows no width and no theme.
const WIDE = { name: "map", width: 2560, height: 1600 };
const PHONE = { name: "phone", width: 1170, height: 2340 };

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

/** The app as it is: the map with a buoy's panel on a wide screen, a phone's screen on a phone. */
export function LandingShot() {
  return (
    <figure className="grid gap-s">
      <div className="relative overflow-hidden rounded-(--radius-s) bg-neutral-2 max-sm:mx-auto max-sm:max-w-80">
        <div className="max-sm:hidden">
          <Picture shot={WIDE} theme="light" />
          <Picture shot={WIDE} theme="dark" />
        </div>
        <div className="sm:hidden">
          <Picture shot={PHONE} theme="light" />
          <Picture shot={PHONE} theme="dark" />
        </div>
        {/* The edge is drawn over the picture, which would hide one drawn under it. */}
        <div
          aria-hidden
          className="edge-inset pointer-events-none absolute inset-0 rounded-[inherit]"
        />
      </div>
      <figcaption className="text-xs text-neutral-7 max-sm:text-center">
        {m.landing_shot_credits()}
      </figcaption>
    </figure>
  );
}
