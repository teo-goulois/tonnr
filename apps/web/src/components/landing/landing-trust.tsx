import { Link } from "@tanstack/react-router";
import { REPOSITORY_URL } from "@repo/config/app";
import { buttonVariants } from "@repo/ui/components/ui/button";
import { PinLockFillDuoIcon } from "@repo/ui/icon";
import { cn } from "@repo/ui/lib/utils";

import { PUBLISHER } from "@/lib/legal";
import { WAVE_HEIGHT_SCALE, scaleColor } from "@/lib/sea-scales";
import { m } from "@/paraglide/messages.js";

import {
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
// changes there changes here, in every language.
const PROMISES = [
  { name: m.landing_trust_alone_name, text: m.landing_trust_alone_text },
  { name: m.landing_trust_hand_name, text: m.landing_trust_hand_text },
  { name: m.landing_trust_sold_name, text: m.landing_trust_sold_text },
  { name: m.landing_trust_check_name, text: m.landing_trust_check_text },
];

/**
 * What the app keeps of a spot and who reads it, for a reader who wonders whether a secret spot
 * stays one: four rules the code holds, where to check them, and the one person who can read the
 * database.
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
              className={cn(arrive, ruled, "grid grid-rows-[auto_1fr] gap-xxs py-m")}
            >
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
        {/* The one limit, said here as the policy says it: whoever runs the server reads its base. */}
        <p
          style={order(2 + PROMISES.length)}
          className={cn(arrive, "max-w-2xl text-s text-neutral-7")}
        >
          {m.landing_trust_host({ publisher: PUBLISHER.name })}
        </p>
      </div>
    </section>
  );
}
