import { APP_SLUG } from "@repo/config/app";
import { Effect, Schedule, Schema } from "effect";

// Every request to a data provider goes through this module, so they all identify themselves
// the same way and share one retry policy.
const USER_AGENT = `${APP_SLUG}/0.1`;
const REQUEST_TIMEOUT_MS = 30_000;

export class UpstreamError extends Schema.TaggedError<UpstreamError>()("UpstreamError", {
  url: Schema.String,
  status: Schema.optional(Schema.Int),
  retryable: Schema.Boolean,
  cause: Schema.optional(Schema.Defect()),
}) {}

// Three more attempts, 0.5 s, 1 s, then 2 s apart, and only for failures worth retrying.
const retrySchedule = Schedule.max([Schedule.exponential("500 millis"), Schedule.recurs(3)]).pipe(
  Schedule.setInputType<UpstreamError>(),
  Schedule.while(({ input }) => input.retryable),
);

/** Fetches a text document from a provider, retrying network failures and 5xx answers. */
export const fetchText = Effect.fn("fetchText")(function* (url: string) {
  const request = Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: (signal) =>
        fetch(url, {
          headers: { "user-agent": USER_AGENT },
          signal: AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
        }),
      catch: (cause) => new UpstreamError({ url, retryable: true, cause }),
    });

    if (!response.ok) {
      return yield* new UpstreamError({
        url,
        status: response.status,
        retryable: response.status >= 500 || response.status === 429,
      });
    }

    return yield* Effect.tryPromise({
      try: () => response.text(),
      catch: (cause) => new UpstreamError({ url, retryable: true, cause }),
    });
  });

  return yield* request.pipe(Effect.retry(retrySchedule));
});

/** Fetches a JSON document from a provider. The caller validates its shape. */
export const fetchJson = Effect.fn("fetchJson")(function* (url: string) {
  const text = yield* fetchText(url);
  return yield* Effect.try({
    try: (): unknown => JSON.parse(text),
    catch: (cause) => new UpstreamError({ url, retryable: false, cause }),
  });
});
