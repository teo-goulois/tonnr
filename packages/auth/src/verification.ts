import type { Database } from "@repo/db";
import { type Count, countCalls } from "@repo/db/calls";
import type { Mailer } from "@repo/mail";
import { type Locale, localeOf, verificationMail } from "@repo/mail/verification";
import { createEmailVerificationToken } from "better-auth/api";

// Checking an account's address by mail: decision 026.

/** How long a link is good for. */
export const VERIFICATION_SECONDS = 24 * 60 * 60;
/** The name the instance's mails are counted under. An account's are under `mail:<its id>`. */
export const MAIL_PROVIDER = "mail";
/** How many mails the instance lets out in a day, unless its settings say otherwise. */
export const DEFAULT_DAILY_MAILS = 200;

// An account is sent a mail to check its address this many times at most.
const AN_HOUR = 3;
const A_DAY = 5;

type Settings = { BETTER_AUTH_URL: string; BETTER_AUTH_SECRET: string; CORS_ORIGIN: string };

/** What became of a mail that was asked for. */
export type Sent =
  | { sent: true }
  // `off`: the instance sends no mail. `account`: the account has had its mails for the hour or
  // the day. `instance`: the instance has sent its mails for the day. `failed`: the provider
  // did not take the mail, or did not say.
  | { sent: false; why: "off" | "instance" | "failed" }
  | { sent: false; why: "account"; retryAfterSeconds: number };

/**
 * What sends an account the mail that checks its address. `mailer` is null on an instance that
 * sends no mail: nothing is checked there. `dailyLimit` is the instance's, a whole number of
 * one at least.
 */
export function createVerification(
  env: Settings,
  database: Database,
  mailer: Mailer | null,
  dailyLimit = DEFAULT_DAILY_MAILS,
) {
  if (!Number.isInteger(dailyLimit) || dailyLimit < 1) {
    throw new Error("EMAIL_DAILY_LIMIT must be a whole number, one at least");
  }
  const webOrigin = new URL(env.CORS_ORIGIN).origin;
  const apiOrigin = new URL(env.BETTER_AUTH_URL).origin;

  // The link opens the API, which sends the browser on to the web app. An instance with no web
  // app has no page to end on: the API's own answer ends the link.
  const linkOf = (token: string) => {
    const link = new URL("/api/auth/verify-email", apiOrigin);
    link.searchParams.set("token", token);
    if (webOrigin !== apiOrigin) link.searchParams.set("callbackURL", `${webOrigin}/verified`);
    return link.href;
  };
  // The account's own counts, then the instance's: one mail is counted in all of them or in
  // none, before it leaves.
  const countsOf = (userId: string): Count[] => [
    { provider: `${MAIL_PROVIDER}:${userId}`, bucket: "hour", span: "hour", limit: AN_HOUR },
    { provider: `${MAIL_PROVIDER}:${userId}`, bucket: "day", span: "day", limit: A_DAY },
    { provider: MAIL_PROVIDER, bucket: "day", span: "day", limit: dailyLimit },
  ];

  /** Sends the mail to an account, with a link made here or the one the sign-in library made. */
  async function send(
    user: { id: string; email: string },
    locale: Locale,
    token?: string,
  ): Promise<Sent> {
    if (!mailer) return { sent: false, why: "off" };

    const full = await countCalls(database, countsOf(user.id));
    if (full) {
      // The account's own limit is the one it can wait for. The instance's is not its to know.
      const own = full.filter((count) => count.provider !== MAIL_PROVIDER);
      if (own.length === 0) return { sent: false, why: "instance" };
      const retryAfterSeconds = Math.max(...own.map((count) => count.retryAfterSeconds));
      return { sent: false, why: "account", retryAfterSeconds };
    }

    const made =
      token ??
      (await createEmailVerificationToken(
        env.BETTER_AUTH_SECRET,
        user.email,
        undefined,
        VERIFICATION_SECONDS,
      ));
    const outcome = await mailer.send(verificationMail(user.email, linkOf(made), locale));
    return outcome === "accepted" ? { sent: true } : { sent: false, why: "failed" };
  }

  return {
    /** Whether this instance checks addresses. */
    isOn: mailer !== null,
    via: mailer?.via ?? null,
    dailyLimit,
    send,
    /**
     * What the sign-in library calls when an account signs up. It never fails: an account is
     * made whether its mail left or not, and asks again.
     */
    onSignUp: async (
      made: { user: { id: string; email: string }; token: string },
      request?: Request,
    ) => {
      try {
        const locale = localeOf(request?.headers.get("accept-language"));
        const result = await send(made.user, locale, made.token);
        if (!result.sent) console.error(`mail: no mail at sign-up (${result.why})`);
      } catch {
        // What failed may name the account: the log says only that it did.
        console.error("mail: no mail at sign-up (it could not be counted)");
      }
    },
  };
}

export type Verification = ReturnType<typeof createVerification>;
