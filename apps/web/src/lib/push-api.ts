import type { AppRouterClient } from "@repo/api/routers/index";

import { type PushApi, PushRefused } from "./push";

// How long the API is given to answer what push asks of it. A tab that waits for an answer
// holds the turn of the browser's other tabs.
const ANSWER_MS = 10_000;
const inTime = () => ({ signal: AbortSignal.timeout(ANSWER_MS) });

const codeOf = (error: unknown) => (error as { code?: unknown } | null)?.code;

// The answers by which the API says that it wrote nothing and will not, as the request stands:
// what it was given is not what it takes, the caller may not, another account is signed in
// than the one the page acts for, or no one is. Any other failure is no answer: a request that
// is told to wait or to come back, a proxy's page, a network that gave up. What was asked may
// then have been done, and is asked again later.
const REFUSALS = ["BAD_REQUEST", "FORBIDDEN", "CONFLICT", "UNAUTHORIZED"];

function refused(error: unknown): never {
  const code = codeOf(error);
  if (typeof code === "string" && REFUSALS.includes(code)) {
    throw new PushRefused(
      code === "UNAUTHORIZED" ? "signed-out" : code === "CONFLICT" ? "other-account" : "refused",
    );
  }
  throw error;
}

/**
 * The API's part of push, called with the session of the account that is signed in.
 * `signedIn` asks who that is, of whatever signs accounts in, and is given the same time: it
 * is asked while the tab holds the turn too.
 */
export function pushApiOf(
  push: AppRouterClient["v1"]["push"],
  signedIn: (within: { signal: AbortSignal }) => Promise<string | null>,
): PushApi {
  return {
    signedIn: () => signedIn(inTime()),
    key: async () => (await push.key(undefined, inTime()).catch(refused)).publicKey,
    devices: async () => (await push.devices(undefined, inTime()).catch(refused)).devices,
    subscribe: (given, account) =>
      push.subscribe({ ...given, account }, inTime()).catch((error: unknown) => {
        // The refusal of an account that keeps as many devices as it may says how many.
        const limit = (error as { data?: { limit?: unknown } } | null)?.data?.limit;
        if (codeOf(error) === "FORBIDDEN" && typeof limit === "number") return "full" as const;
        return refused(error);
      }),
    renew: (id, given, account) =>
      push.renew({ ...(id === null ? {} : { id }), ...given, account }, inTime()).then(
        (device) => ({ id: device.id }),
        (error: unknown) => (codeOf(error) === "NOT_FOUND" ? ("gone" as const) : refused(error)),
      ),
    forget: (endpoint, account) => push.forget({ endpoint, account }, inTime()).catch(refused),
    remove: (id, account) =>
      push.remove({ id, account }, inTime()).catch((error: unknown) => {
        if (codeOf(error) !== "NOT_FOUND") refused(error);
      }),
  };
}
