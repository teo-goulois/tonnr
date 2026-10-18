import { Link } from "@tanstack/react-router";
import { REPOSITORY_URL } from "@repo/config/app";
import { buttonVariants } from "@repo/ui/components/ui/button";
import {
  BracketsCurlyFillDuoIcon,
  EyeSlashFillDuoIcon,
  PinLockFillDuoIcon,
  ShakaHandFillDuoIcon,
  TagSlashFillDuoIcon,
} from "@repo/ui/icon";
import { cn } from "@repo/ui/lib/utils";

import { WAVE_HEIGHT_SCALE, WIND_SPEED_SCALE, scaleColor } from "@/lib/sea-scales";
import { m } from "@/paraglide/messages.js";

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

/**
 * What the app keeps of a spot and who reads it, for a reader who wonders whether a secret spot
 * stays one: four rules the code holds, and where to check them.
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
      <div className="grid gap-m">
        <ul className="grid gap-x-xl sm:grid-cols-2 lg:grid-cols-4">
          {PROMISES.map((promise, index) => (
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
              <h3 className="font-medium">{promise.name()}</h3>
              <p className="text-neutral-7">{promise.text()}</p>
            </li>
          ))}
        </ul>
        {/* Where each rule is checked: the code, and the policy that says the same at length. */}
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
      </div>
    </section>
  );
}
