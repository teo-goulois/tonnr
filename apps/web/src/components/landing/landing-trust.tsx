import { Link } from "@tanstack/react-router";
import { REPOSITORY_URL } from "@repo/config/app";
import { buttonVariants } from "@repo/ui/components/ui/button";
import {
  BracketsCurlyFillDuoIcon,
  EyeSlashFillDuoIcon,
  LockIcon,
  PinLockFillDuoIcon,
  ShakaHandFillDuoIcon,
  TagSlashFillDuoIcon,
} from "@repo/ui/icon";
import { cn } from "@repo/ui/lib/utils";

import { BreakPill } from "@/components/viewer/map-markers";
import { WAVE_HEIGHT_SCALE, WIND_SPEED_SCALE, scaleColor } from "@/lib/sea-scales";
import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";

import {
  Lively,
  SECTIONS,
  SectionTitle,
  Tile,
  Woven,
  apart,
  arrive,
  column,
  order,
  ruled,
  under,
  useArriving,
} from "./landing-parts";

// The blue of a small, clean sea, for what is kept quiet.
const TRUST_COLOR = scaleColor(WAVE_HEIGHT_SCALE, 1.5);

// What the code guarantees of a spot, and nothing more: a spot is its owner's alone (decision
// 034), leaves by a shared list (035), a request to publish it (034) or an assistant (047), and
// what is counted of a call names no input (044). `/privacy` says the same at length: a rule that
// changes there changes here, in every language. Each rule is drawn as a tile, an icon on a color
// of the sea's scales, as the titles of the page draw a word: an eye that is shut, a shaka for
// the owner's hand, a price tag struck out, and the braces of the code.
const PROMISES = [
  {
    name: m.landing_trust_alone_name,
    text: m.landing_trust_alone_text,
    icon: EyeSlashFillDuoIcon,
    color: scaleColor(WAVE_HEIGHT_SCALE, 0.8),
  },
  {
    name: m.landing_trust_hand_name,
    text: m.landing_trust_hand_text,
    icon: ShakaHandFillDuoIcon,
    color: scaleColor(WIND_SPEED_SCALE, 25),
  },
  {
    name: m.landing_trust_sold_name,
    text: m.landing_trust_sold_text,
    icon: TagSlashFillDuoIcon,
    color: scaleColor(WAVE_HEIGHT_SCALE, 3),
  },
  {
    name: m.landing_trust_check_name,
    text: m.landing_trust_check_text,
    icon: BracketsCurlyFillDuoIcon,
    color: scaleColor(WIND_SPEED_SCALE, 12),
  },
];

// The map of the hero, as `landing-shots.mjs` takes it of the app, in the reader's theme and
// language: its map and its sea are credited on `/sources`.
const mapOf = (theme: "light" | "dark") => `/landing/hero-map-${theme}-${getLocale()}.webp`;

// Where the spot stands on that map, as a share of its width and height: a point of the north
// coast of Brittany, with sea on three sides. The map is set so that this point stands in the
// box whatever the box's shape, large enough that no edge of the picture, nor the header it
// holds at its top, comes into view.
const SPOT = { x: 76, y: 30 };

/**
 * A piece of the app beside the rules: a spot of one's own on the map, drawn as the map draws
 * the place in hand, with what its panel says under its name. Pointing at it lifts the marker a
 * little, as the hero's map follows the pointer.
 */
function PrivateSpot() {
  return (
    <div
      aria-hidden
      className="group/spot relative aspect-[4/3] overflow-hidden rounded-(--radius-s) bg-neutral-2 edge sm:aspect-[16/10] lg:aspect-auto lg:h-full lg:min-h-64"
    >
      <div
        style={{ translate: `-${SPOT.x}% -${SPOT.y}%` }}
        className="absolute top-1/2 left-[60%] aspect-[3390/1990] h-[220%] transition-transform duration-700 ease-theme-large group-hover/spot:scale-[1.03] motion-reduce:transition-none"
      >
        {/* Both are lazy, so that a browser fetches only the one its theme shows. */}
        {(["light", "dark"] as const).map((theme) => (
          <img
            key={theme}
            src={mapOf(theme)}
            alt=""
            loading="lazy"
            className={cn(
              "absolute inset-0 size-full object-cover",
              theme === "light" ? "dark:hidden" : "hidden dark:block",
            )}
          />
        ))}
        <div
          style={{ left: `${SPOT.x}%`, top: `${SPOT.y}%` }}
          className="absolute flex -translate-x-1/2 -translate-y-full flex-col items-center transition-transform duration-500 ease-theme-large group-hover/spot:-translate-y-[calc(100%+6px)] motion-reduce:transition-none"
        >
          <BreakPill
            name={m.landing_spots_example()}
            own
            selected
            // The landing's own size, which Téo chose here, over the map's 12 pixels.
            className="text-m shadow-(--shadow-m)"
          />
          <span className="h-3 w-0.5 bg-color-1" />
          <span className="-mt-px size-1.5 rounded-full bg-color-1 ring-1 ring-neutral-1" />
        </div>
      </div>
      {/* The page washes the bottom of the map a little, so that the line under it reads. */}
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-linear-to-t from-neutral-1/60 to-transparent" />
      {/* What the viewer says under the name of a spot of one's own. */}
      <div className="absolute inset-x-m bottom-m flex items-center gap-xs rounded-(--radius-xs) bg-neutral-1/90 px-s py-xs text-s backdrop-blur-md edge">
        <LockIcon className="size-3.5 shrink-0 text-neutral-7" />
        <span className="truncate">{m.spot_own()}</span>
      </div>
    </div>
  );
}

/**
 * What the app keeps of a spot and who reads it, for a reader who wonders whether a secret spot
 * stays one: a spot of one's own on the map, four rules the code holds, and where to check them.
 */
export function LandingTrust() {
  const arriving = useArriving<HTMLElement>();
  return (
    <section
      {...arriving}
      aria-labelledby={SECTIONS.trust}
      className={`${column} ${apart} ${under} group/arrival grid`}
    >
      <SectionTitle
        id={SECTIONS.trust}
        title={
          <Woven
            say={m.landing_trust_title}
            words={{
              secret: (
                <>
                  <Tile color={TRUST_COLOR}>
                    <PinLockFillDuoIcon />
                  </Tile>
                  {m.landing_trust_word()}
                </>
              ),
            }}
          />
        }
        className={cn(arrive, "max-w-4xl scroll-mt-[calc(var(--space-xxl)*2)]")}
      />
      <div className="grid gap-m lg:grid-cols-12 lg:gap-x-xl">
        <div style={order(1)} className={cn(arrive, "lg:col-span-5")}>
          <PrivateSpot />
        </div>
        <div className="grid gap-m lg:col-span-7">
          <ul className="grid gap-x-xl sm:grid-cols-2">
            {PROMISES.map((promise, index) => (
              <li
                key={promise.name()}
                style={order(2 + index)}
                className={cn(arrive, ruled, "grid grid-rows-[auto_auto_1fr] gap-xxs py-m")}
              >
                {/* The tile stands alone over its words, larger than one set in a line. */}
                <Lively className="mb-xs block w-fit text-[2rem]">
                  <Tile color={promise.color}>
                    <promise.icon />
                  </Tile>
                </Lively>
                <h3 className="font-medium">{promise.name()}</h3>
                <p className="text-neutral-7">{promise.text()}</p>
              </li>
            ))}
          </ul>
          {/* Where each rule is checked: the code, and the policy that says the same at length. */}
          <div
            style={order(2 + PROMISES.length)}
            className={cn(arrive, "flex flex-wrap items-center gap-m")}
          >
            <a href={REPOSITORY_URL} className={buttonVariants()}>
              {m.landing_trust_code()}
            </a>
            <Link to="/privacy" className={buttonVariants({ variant: "outline" })}>
              {m.privacy_title()}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
