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
      try: (signal) => {
        // An interrupted run stops the download instead of leaving it open until the timeout.
        signal.addEventListener("abort", () => void response.body?.cancel().catch(() => {}));
        return read(response);
      },
      // A file that is too large stays too large: asking again would only download it again.
      catch: (cause) =>
        new UpstreamError({ url, retryable: !(cause instanceof TooLargeError), cause }),
    });
  });

  return yield* request.pipe(Effect.retry(retrySchedule));
});

class TooLargeError extends Error {}

/** Reads a body up to a size, and stops the download when the body turns out to be larger. */
async function readUpTo(response: Response, maxBytes: number) {
  // Stopping the download is a courtesy. Whether it works or not, the file is too large.
  const tooLarge = async () => {
    await response.body?.cancel().catch(() => {});
    return new TooLargeError(`the file is larger than ${maxBytes} bytes`);
  };
  // The announced size is that of the body as it travels. It says how large the body is only
  // when the body is not compressed on the way.
  const announced = Number(response.headers.get("content-length"));
  if (!response.headers.get("content-encoding") && announced > maxBytes) throw await tooLarge();

  const parts: Uint8Array[] = [];
  let size = 0;
  if (response.body) {
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => {});
        throw await tooLarge();
      }
      parts.push(value);
    }
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  return bytes;
}

// What a text answer may weigh at most. The largest one read today is a megabyte.
const MAX_TEXT_BYTES = 32 * 1024 * 1024;

/** Fetches a text document from a provider. */
export const fetchText = (url: string) =>
  fetchBody(url, async (response) =>
    new TextDecoder().decode(await readUpTo(response, MAX_TEXT_BYTES)),
  );

/**
 * Fetches a file from a provider as it is, for the formats that are not text. The caller says
 * how large the file may be, so that a provider cannot fill the memory with one answer.
 */
export const fetchBytes = (url: string, maxBytes: number) =>
  fetchBody(url, (response) => readUpTo(response, maxBytes));

/** Fetches a JSON document from a provider. The caller validates its shape. */
export const fetchJson = Effect.fn("fetchJson")(function* (url: string) {
  const text = yield* fetchText(url);
  return yield* Effect.try({
    try: (): unknown => JSON.parse(text),
    catch: (cause) => new UpstreamError({ url, retryable: false, cause }),
  });
});
