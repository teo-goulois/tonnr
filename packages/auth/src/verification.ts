import { localePrefix } from "@repo/config/locales";
import type { Database } from "@repo/db";
import { type Count, countCalls } from "@repo/db/calls";
import { alertSettings } from "@repo/db/schema/alerts";
import { type Mail, type Mailer, MAIL_PROVIDER } from "@repo/mail";
import { resetMail } from "@repo/mail/reset";
import { type Locale, localeOf, verificationMail } from "@repo/mail/verification";
import { createEmailVerificationToken } from "better-auth/api";
import { eq } from "drizzle-orm";

// The mails of an account's own address: the one that checks it, and the one that lets the
// account choose a new password. Decision 026.

/** How long a link that checks an address is good for. */
export const VERIFICATION_SECONDS = 24 * 60 * 60;
/**
 * How long a link to choose a new password is good for: an hour, the sign-in library's own
 * default. It works once.
 */
export const RESET_SECONDS = 60 * 60;
// The instance's mails are counted under `MAIL_PROVIDER`, and an account's under
// `mail:<its id>`.
export { MAIL_PROVIDER };
/** How many mails the instance lets out in a day, unless its settings say otherwise. */
export const DEFAULT_DAILY_MAILS = 200;

// An account is sent a mail of each kind this many times at most: to check its address, and,
// counted apart, to choose a new password.
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

  // The link opens the API, which sends the browser on to the web app, to the page in the
  // language of the mail: French lives under `/fr` there, Spanish under `/es`. An instance with no
  // web app has no page to end on: the API's own answer ends the link.
  const linkOf = (token: string, locale: Locale) => {
    const link = new URL("/api/auth/verify-email", apiOrigin);
    link.searchParams.set("token", token);
    if (webOrigin !== apiOrigin) {
      const page = `${localePrefix(locale)}/verified`;
      link.searchParams.set("callbackURL", `${webOrigin}${page}`);
    }
    return link.href;
  };
  // The link to choose a new password opens the page of the web app that asks for it, in the
  // language of the mail, with the token the sign-in library made. The page sends it back.
  const resetLinkOf = (token: string, locale: Locale) => {
    const page = new URL(`${localePrefix(locale)}/reset-password`, webOrigin);
    page.searchParams.set("token", token);
    return page.href;
  };
  // The account's own counts of one kind of mail, then the instance's: one mail is counted in
  // all of them or in none, before it leaves. A check is counted under `hour` and `day`, a new
  // password under `reset-hour` and `reset-day`.
  const countsOf = (userId: string, kind: "" | "reset-"): Count[] => [
    { provider: `${MAIL_PROVIDER}:${userId}`, bucket: `${kind}hour`, span: "hour", limit: AN_HOUR },
    { provider: `${MAIL_PROVIDER}:${userId}`, bucket: `${kind}day`, span: "day", limit: A_DAY },
    { provider: MAIL_PROVIDER, bucket: "day", span: "day", limit: dailyLimit },
  ];

  /** Counts a mail to an account, then sends it, written once it is counted. */
  async function deliver(counts: Count[], write: () => Promise<Mail>): Promise<Sent> {
    if (!mailer) return { sent: false, why: "off" };

    const full = await countCalls(database, counts);
    if (full) {
      // The account's own limit is the one it can wait for. The instance's is not its to know.
      const own = full.filter((count) => count.provider !== MAIL_PROVIDER);
      if (own.length === 0) return { sent: false, why: "instance" };
      const retryAfterSeconds = Math.max(...own.map((count) => count.retryAfterSeconds));
      return { sent: false, why: "account", retryAfterSeconds };
    }

    const outcome = await mailer.send(await write());
    return outcome === "accepted" ? { sent: true } : { sent: false, why: "failed" };
  }

  /** Sends the mail to an account, with a link made here or the one the sign-in library made. */
  function send(user: { id: string; email: string }, locale: Locale, token?: string) {
    return deliver(countsOf(user.id, ""), async () => {
      const made =
        token ??
        (await createEmailVerificationToken(
          env.BETTER_AUTH_SECRET,
          user.email,
          undefined,
          VERIFICATION_SECONDS,
        ));
      return verificationMail(user.email, linkOf(made, locale), locale);
    });
  }

  /**
   * Sends an account the link to choose a new password, in its language: the one its alerts are
   * sent in once it is known, and the one the request asks for until then.
   */
  async function sendReset(
    user: { id: string; email: string },
    token: string,
    acceptLanguage: string | null | undefined,
  ) {
    const [settings] = await database
      .select({ locale: alertSettings.locale })
      .from(alertSettings)
      .where(eq(alertSettings.userId, user.id));
    const locale = settings?.locale ?? localeOf(acceptLanguage);
    return deliver(countsOf(user.id, "reset-"), async () =>
      resetMail(user.email, resetLinkOf(token, locale), locale),
    );
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
    /**
     * What the sign-in library calls when an address that has an account asks for a new
     * password. It answers at once and sends the mail after: an address with an account would
     * otherwise be answered later than one without, and the time would tell which. It never
     * fails, for the same reason.
     */
    onResetAsked: (
      asked: { user: { id: string; email: string }; token: string },
      request?: Request,
    ): Promise<void> => {
      const acceptLanguage = request?.headers.get("accept-language");
      void sendReset(asked.user, asked.token, acceptLanguage).then(
        (result) => {
          if (!result.sent) console.error(`mail: no mail for a new password (${result.why})`);
        },
        // What failed may name the account: the log says only that it did.
        () => console.error("mail: no mail for a new password (it could not be counted)"),
      );
      return Promise.resolve();
    },
  };
}

export type Verification = ReturnType<typeof createVerification>;
