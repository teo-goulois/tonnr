import { createVerification } from "@repo/auth/verification";
import type { Database } from "@repo/db";
import { testMailer } from "@repo/mail/testing";
import { UpstreamError } from "@repo/upstream";
import { Effect } from "effect";

import { createPlaces } from "./places";

// For the tests of the API and of a program that serves it: forecasts and places with a function
// in place of the provider, and mail kept in memory. No test asks a provider anything.
export { testForecasts } from "@repo/conditions/forecasts/testing";

const SETTINGS = {
  BETTER_AUTH_URL: "http://localhost:3000",
  BETTER_AUTH_SECRET: "made-up-for-these-tests-and-long-enough",
  CORS_ORIGIN: "http://localhost:3001",
};

type Mailing = {
  // False for an instance that sends no mail.
  on?: boolean;
  // A provider that takes no mail.
  failing?: boolean;
  dailyLimit?: number;
  settings?: Partial<typeof SETTINGS>;
};

/**
 * What sends the mail that checks an address, in a test. `sent` gives the mails that left, and
 * the link in the last of them.
 */
export function testVerification(db: Database, mailing: Mailing = {}) {
  const { on = true, failing = false, dailyLimit, settings } = mailing;
  const out = on ? testMailer({ failing }) : null;
  const verification = createVerification(
    { ...SETTINGS, ...settings },
    db,
    out?.mailer ?? null,
    dailyLimit,
  );
  const sent = () => out?.sent() ?? [];
  return {
    verification,
    sent,
    // The link of the last mail, as the account would follow it.
    link: () => /https?:\/\/\S+/.exec(sent().at(-1)?.text ?? "")?.[0] ?? null,
  };
}

/**
 * The search of places, in a test. What the service answers is given, as a document or as the
 * status it refuses with, and `asked` gives the addresses it was asked. The clock is the test's
 * to set, with `at`.
 */
export function testPlaces(answer: unknown = { features: [] }, startsAt = Date.now()) {
  const asked: string[] = [];
  let next = answer;
  let now = startsAt;
  const places = createPlaces(
    { PLACES_URL: "https://places.example.org" },
    (address) => {
      asked.push(address);
      return typeof next === "number"
        ? Effect.fail(new UpstreamError({ url: address, status: next, retryable: false }))
        : Effect.succeed(next);
    },
    () => now,
  );
  return {
    places,
    asked,
    answers: (document: unknown) => {
      next = document;
    },
    at: (time: number) => {
      now = time;
    },
  };
}
