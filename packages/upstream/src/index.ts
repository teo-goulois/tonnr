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

/** Fetches a document from a provider and reads its body, retrying network failures and 5xx answers. */
const fetchBody = Effect.fn("fetchBody")(function* <Body>(
  url: string,
  read: (response: Response) => Promise<Body>,
) {
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
      try: () => read(response),
      catch: (cause) => new UpstreamError({ url, retryable: true, cause }),
    });
  });

  return yield* request.pipe(Effect.retry(retrySchedule));
});

/** Fetches a text document from a provider. */
export const fetchText = (url: string) => fetchBody(url, (response) => response.text());

/** Fetches a file from a provider as it is, for the formats that are not text. */
export const fetchBytes = (url: string) =>
  fetchBody(url, async (response) => new Uint8Array(await response.arrayBuffer()));

/** Fetches a JSON document from a provider. The caller validates its shape. */
export const fetchJson = Effect.fn("fetchJson")(function* (url: string) {
  const text = yield* fetchText(url);
  return yield* Effect.try({
    try: (): unknown => JSON.parse(text),
    catch: (cause) => new UpstreamError({ url, retryable: false, cause }),
  });
});
