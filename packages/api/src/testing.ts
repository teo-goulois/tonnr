import { createVerification } from "@repo/auth/verification";
import type { Database } from "@repo/db";
import { testMailer } from "@repo/mail/testing";

// For the tests of the API and of a program that serves it: forecasts with a function in place
// of the provider, and mail kept in memory. No test asks a provider anything.
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
