import { Link, useSearch } from "@tanstack/react-router";
import { REPOSITORY_URL } from "@repo/config/app";
import { buttonVariants } from "@repo/ui/components/ui/button";
import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  BracketsCurlyFillDuoIcon,
  EyeSlashFillDuoIcon,
  LockIcon,
  PinLockFillDuoIcon,
  ShakaHandFillDuoIcon,
  TagSlashFillDuoIcon,
} from "@repo/ui/icon";
import { cn } from "@repo/ui/lib/utils";
import type { ReactNode } from "react";

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

// PROTOTYPE: three proposals for the section, chosen by `?trust=1|2|3` on the landing. 0 is the
// section as it is on main. Nothing of this goes to main as it is.
type Variant = 0 | 1 | 2 | 3;

// PROTOTYPE: where each rule is checked, for variant 1. A rule of the policy leads to its
// section, a rule of the code to its decision.
const decision = (file: string) => `${REPOSITORY_URL}/blob/main/docs/decisions/${file}`;

const PROMISES = [
  {
    name: m.landing_trust_alone_name,
    short: m.landing_trust_alone_short,
    text: m.landing_trust_alone_text,
    born: m.landing_trust_alone_born,
    icon: EyeSlashFillDuoIcon,
    color: scaleColor(WAVE_HEIGHT_SCALE, 0.8),
    proof: { to: "/privacy#content", label: m.landing_trust_in_policy },
  },
  {
    name: m.landing_trust_hand_name,
    short: m.landing_trust_hand_short,
    text: m.landing_trust_hand_text,
    icon: ShakaHandFillDuoIcon,
    color: scaleColor(WIND_SPEED_SCALE, 25),
    proof: { href: decision("035-shared-lists.md"), label: m.landing_trust_in_code },
  },
  {
    name: m.landing_trust_sold_name,
    short: m.landing_trust_sold_short,
    text: m.landing_trust_sold_text,
    icon: TagSlashFillDuoIcon,
    color: scaleColor(WAVE_HEIGHT_SCALE, 3),
    proof: { to: "/privacy#analytics", label: m.landing_trust_in_policy },
  },
  {
    name: m.landing_trust_check_name,
    short: m.landing_trust_check_short,
    text: m.landing_trust_check_text,
    icon: BracketsCurlyFillDuoIcon,
    color: scaleColor(WIND_SPEED_SCALE, 12),
    proof: { href: REPOSITORY_URL, label: m.landing_trust_code },
  },
];

/** PROTOTYPE, variant 1: the link under a rule that leads to where it is checked. */
function Proof({ to, href, label }: { to?: string; href?: string; label: () => string }) {
  const look =
    "mt-xs inline-flex w-fit items-center gap-xxs text-s text-neutral-7 underline-offset-4 hover:text-neutral-10 hover:underline";
  if (href) {
    return (
      <a href={href} className={look}>
        {label()}
        <ArrowUpRightIcon className="size-3.5" />
      </a>
    );
  }
  return (
    <Link to={to as "/privacy"} className={look}>
      {label()}
      <ArrowRightIcon className="size-3.5" />
    </Link>
  );
}

// PROTOTYPE, variant 3: the map of the hero, as `landing-shots.mjs` takes it of the app.
const mapOf = (theme: "light" | "dark") => `/landing/hero-map-${theme}-${getLocale()}.webp`;

/**
 * PROTOTYPE, variant 3: a piece of the app beside the rules. A spot of one's own on the map,
 * drawn as the map draws it, with what its panel says under its name. Pointing at it moves the
 * marker a little, as the hero's map follows the pointer.
 */
function PrivateSpot() {
  return (
    <div
      aria-hidden
      className="group/spot relative aspect-[4/3] overflow-hidden rounded-(--radius-s) bg-neutral-2 edge sm:aspect-[16/10] lg:aspect-auto lg:h-full lg:min-h-64"
    >
      {/* The map is set so that a point of the coast stands under the marker, whatever the box. */}
      <div className="absolute top-[50%] left-[60%] aspect-[3390/1990] h-[220%] -translate-x-[76%] -translate-y-[30%] transition-transform duration-700 ease-theme-large group-hover/spot:scale-[1.03] motion-reduce:transition-none">
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
        <div className="absolute top-[30%] left-[76%] flex -translate-x-1/2 -translate-y-full flex-col items-center transition-transform duration-500 ease-theme-large group-hover/spot:-translate-y-[calc(100%+6px)] motion-reduce:transition-none">
          <BreakPill name={m.landing_spots_example()} own selected className="shadow-(--shadow-m)" />
          <span className="h-3 w-0.5 bg-color-1" />
          <span className="-mt-px size-1.5 rounded-full bg-color-1 ring-1 ring-neutral-1" />
        </div>
      </div>
      {/* The page washes the bottom of the map a little, so that the line under it reads. */}
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-linear-to-t from-neutral-1/60 to-transparent" />
      <div className="absolute inset-x-m bottom-m flex items-center gap-xs rounded-(--radius-xs) bg-neutral-1/90 px-s py-xs text-s backdrop-blur-md edge">
        <LockIcon className="size-3.5 shrink-0 text-neutral-7" />
        <span className="truncate">{m.spot_own()}</span>
      </div>
    </div>
  );
}

/**
 * What the app keeps of a spot and who reads it, for a reader who wonders whether a secret spot
 * stays one: four rules the code holds, and where to check them.
 */
export function LandingTrust() {
  const arriving = useArriving<HTMLElement>();
  const search = useSearch({ strict: false }) as { trust?: number };
  const variant = ([0, 1, 2, 3].includes(search.trust ?? 0) ? (search.trust ?? 0) : 0) as Variant;

  const rules = PROMISES.map((promise, index) => (
    <li
      key={promise.name()}
      style={order(1 + index)}
      className={cn(arrive, ruled, "grid grid-rows-[auto_auto_1fr] gap-xxs py-m")}
    >
      {/* The tile stands alone over its words, larger than one set in a line. */}
      <Lively className="mb-xs block w-fit text-[2rem]">
        <Tile color={promise.color}>
          <promise.icon />
        </Tile>
      </Lively>
      <h3 className="font-medium">{variant === 2 ? promise.short() : promise.name()}</h3>
      <p className="text-neutral-7">
        {variant === 2 && promise.born ? promise.born() : promise.text()}
      </p>
      {variant === 1 && <Proof {...promise.proof} />}
    </li>
  ));

  const buttons: ReactNode = variant !== 1 && (
    <div
      style={order(1 + PROMISES.length)}
      className={cn(arrive, "flex flex-wrap items-center gap-m")}
    >
      <a href={REPOSITORY_URL} className={buttonVariants()}>
        {m.landing_trust_code()}
      </a>
      <Link to="/privacy" className={buttonVariants({ variant: "outline" })}>
        {m.privacy_title()}
      </Link>
    </div>
  );

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
      {variant === 3 ? (
        <div className="grid gap-m lg:grid-cols-12 lg:gap-x-xl">
          <div style={order(1)} className={cn(arrive, "lg:col-span-5")}>
            <PrivateSpot />
          </div>
          <div className="grid gap-m lg:col-span-7">
            <ul className="grid gap-x-xl sm:grid-cols-2">{rules}</ul>
            {buttons}
          </div>
        </div>
      ) : (
        <div className="grid gap-m">
          <ul className="grid gap-x-xl sm:grid-cols-2 lg:grid-cols-4">{rules}</ul>
          {buttons}
        </div>
      )}
    </section>
  );
}
