import { ORPCError } from "@orpc/server";
import { type Count, countCalls } from "@repo/db/calls";

import type { Caller } from "./index";
import type { Context } from "./context";

// What one caller may ask of the forecasts in an hour: a forecast, the trial of an alert, or
// the conditions of a session, each counted as one question whatever it costs the provider.
// A key is held to its developer account's limit instead. Decision 053.
export const FORECAST_QUESTIONS_AN_HOUR: Limits = {
  session: 600,
  // A visitor is known by the address they come from, which a household or an office shares.
  visitor: 300,
  link: 300,
};

type Limits = { session: number; visitor: number; link: number };

// The counts are kept with the provider's, under a name of their own, and pruned with them.
export const FORECAST_CALLERS = "forecast-callers";

type Named = Caller & { address?: string | null };

/** The count a caller's question adds to, with its limit. Null for a key. */
export function forecastQuestionCount(
  caller: Named,
  limits: Limits = FORECAST_QUESTIONS_AN_HOUR,
): Count | null {
  const limit = (limit: number, who: string): Count => ({
    provider: FORECAST_CALLERS,
    bucket: `hour:${who}`,
    span: "hour",
    limit,
  });
  switch (caller.via) {
    case "key":
      return null;
    case "session":
      return limit(limits.session, `session:${caller.userId}`);
    case "link":
      return limit(limits.link, `link:${caller.listId}`);
    case "visitor":
      // A visitor whose address nothing says is counted with every other such visitor.
      return limit(limits.visitor, `visitor:${caller.address ?? "unknown"}`);
  }
}

/**
 * Counts one question of a caller's, and refuses it, with how long to wait, once the caller has
 * asked its hour's questions. For what asks the forecasts: the question is counted before it
 * is asked, so a question that fails counts too.
 */
export async function admitForecastQuestion(
  context: Pick<Context, "db" | "reply" | "session"> & {
    // What the shared data is asked by, or, for what is an account's own, its session.
    caller?: Caller;
    address?: string | null;
  },
  limits?: Limits,
) {
  const caller: Caller | null =
    context.caller ??
    (context.session ? { via: "session", userId: context.session.user.id } : null);
  if (!caller) throw new ORPCError("UNAUTHORIZED");
  const count = forecastQuestionCount({ ...caller, address: context.address }, limits);
  if (!count) return;
  const full = await countCalls(context.db, [count]);
  if (full === null) return;
  context.reply.retryAfterSeconds = full[0]?.retryAfterSeconds;
  throw new ORPCError("TOO_MANY_REQUESTS", {
    message: `You have asked for ${count.limit} forecasts in an hour. Try again when it turns.`,
  });
}
