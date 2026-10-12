import { describe, expect, it, vi } from "vitest";

import { PushRefused } from "./push";
import { pushApiOf } from "./push-api";

// The account the page acts for.
const ACCOUNT = "ana";

// The API's procedures of push, as the client gives them: each answers what the test says, or
// fails with it.
type Push = Parameters<typeof pushApiOf>[0];
function client(answers: Partial<Record<keyof Push, unknown>> = {}) {
  const calls: { name: string; input: unknown; hasSignal: boolean }[] = [];
  const procedure = (name: keyof Push) =>
    vi.fn(async (input: unknown, options?: { signal?: AbortSignal }) => {
      calls.push({ name, input, hasSignal: options?.signal instanceof AbortSignal });
      const answer = answers[name];
      // An error of any kind, the browser's own included, is a failure of the call.
      if (answer instanceof Error || answer instanceof DOMException) throw answer;
      return answer;
    });
  const push = Object.fromEntries(
    (["key", "devices", "subscribe", "renew", "forget", "remove"] as const).map((name) => [
      name,
      procedure(name),
    ]),
  ) as unknown as Push;
  // Who is signed in is asked of whatever signs accounts in, which the test stands for.
  const signedIn = async (within: { signal?: AbortSignal }) => {
    calls.push({
      name: "signedIn",
      input: undefined,
      hasSignal: within?.signal instanceof AbortSignal,
    });
    return ACCOUNT;
  };
  return { api: pushApiOf(push, signedIn), calls };
}
// An error as the API's client throws it for an answer of that code and status.
const answered = (code: string, status: number, data?: unknown) =>
  Object.assign(new Error(code), { code, status, data });
const caught = (work: Promise<unknown>) =>
  work.then(
    () => {
      throw new Error("answered");
    },
    (error: unknown) => error,
  );

const GIVEN = { endpoint: "https://push.example/held", keys: { p256dh: "a", auth: "b" } };
const ID = "0b9c1f0e-6f1c-4c7e-9a43-2f1d6b7a8c90";

describe("the API's part of push", () => {
  it("says who is signed in as it is told, and asks it within a time too", async () => {
    const { api, calls } = client();

    expect(await api.signedIn()).toBe(ACCOUNT);
    // It is asked while the tab holds the turn of the browser's other tabs.
    expect(calls).toEqual([{ name: "signedIn", input: undefined, hasSignal: true }]);
  });

  it("asks each thing of the API within a time, and passes on what it answers", async () => {
    const device = { id: ID, label: null, createdAt: new Date(), seenAt: new Date() };
    const { api, calls } = client({
      key: { publicKey: "the-key" },
      devices: { devices: [device] },
      subscribe: device,
      renew: device,
      forget: { forgotten: true },
      remove: { id: ID },
    });

    expect(await api.key()).toBe("the-key");
    expect(await api.devices()).toEqual([device]);
    expect(await api.subscribe(GIVEN, ACCOUNT)).toEqual(device);
    expect(await api.renew(ID, GIVEN, ACCOUNT)).toEqual({ id: ID });
    // A browser that kept no id names none: the API then knows it by its address.
    expect(await api.renew(null, GIVEN, ACCOUNT)).toEqual({ id: ID });
    await api.forget(GIVEN.endpoint, ACCOUNT);
    await api.remove(ID, ACCOUNT);

    expect(calls.map(({ name, input }) => [name, input])).toEqual([
      ["key", undefined],
      ["devices", undefined],
      // What makes a device or says one again names the account the page acts for.
      ["subscribe", { ...GIVEN, account: ACCOUNT }],
      ["renew", { id: ID, ...GIVEN, account: ACCOUNT }],
      ["renew", { ...GIVEN, account: ACCOUNT }],
      ["forget", { endpoint: GIVEN.endpoint, account: ACCOUNT }],
      ["remove", { id: ID, account: ACCOUNT }],
    ]);
    expect(calls.every((call) => call.hasSignal)).toBe(true);
  });

  it("says that the account is full, from the refusal that says how many devices it keeps", async () => {
    const full = client({ subscribe: answered("FORBIDDEN", 403, { limit: 10 }) });
    expect(await full.api.subscribe(GIVEN, ACCOUNT)).toBe("full");

    // Another 403 is a refusal like any other.
    const other = client({ subscribe: answered("FORBIDDEN", 403) });
    expect(await caught(other.api.subscribe(GIVEN, ACCOUNT))).toBeInstanceOf(PushRefused);
  });

  it("says that a device is gone, and takes one that is gone already for removed", async () => {
    const { api } = client({
      renew: answered("NOT_FOUND", 404),
      remove: answered("NOT_FOUND", 404),
    });

    expect(await api.renew(ID, GIVEN, ACCOUNT)).toBe("gone");
    await expect(api.remove(ID, ACCOUNT)).resolves.toBeUndefined();
  });

  it.each([
    ["what it was given is not what the API takes", answered("BAD_REQUEST", 400), "refused"],
    ["the caller may not", answered("FORBIDDEN", 403), "refused"],
    // The two by which a page learns that it is behind.
    ["another account is signed in than the page's", answered("CONFLICT", 409), "other-account"],
    ["no one is signed in", answered("UNAUTHORIZED", 401), "signed-out"],
  ])("tells a refusal, which wrote nothing: %s", async (_what, error, why) => {
    for (const ask of [
      (api: ReturnType<typeof pushApiOf>) => api.key(),
      (api: ReturnType<typeof pushApiOf>) => api.devices(),
      (api: ReturnType<typeof pushApiOf>) => api.subscribe(GIVEN, ACCOUNT),
      (api: ReturnType<typeof pushApiOf>) => api.renew(ID, GIVEN, ACCOUNT),
      (api: ReturnType<typeof pushApiOf>) => api.forget(GIVEN.endpoint, ACCOUNT),
      (api: ReturnType<typeof pushApiOf>) => api.remove(ID, ACCOUNT),
    ]) {
      const { api } = client({
        key: error,
        devices: error,
        subscribe: error,
        renew: error,
        forget: error,
        remove: error,
      });
      const refusal = await caught(ask(api));
      expect(refusal).toBeInstanceOf(PushRefused);
      expect((refusal as PushRefused).why).toBe(why);
      expect((refusal as PushRefused).isBehind).toBe(why !== "refused");
    }
  });

  it.each([
    ["a request told to wait", answered("TOO_MANY_REQUESTS", 429)],
    ["a request that took too long", answered("TIMEOUT", 408)],
    ["an instance that sends no push, or that is down", answered("SERVICE_UNAVAILABLE", 503)],
    ["a fault of the API", answered("INTERNAL_SERVER_ERROR", 500)],
    [
      "a page of a proxy, which is no answer of the API",
      Object.assign(new Error(), { status: 403 }),
    ],
    ["a network that gave up", new TypeError("Failed to fetch")],
    ["a request given up for want of time", new DOMException("timed out", "TimeoutError")],
  ])("takes for no answer, which may have written: %s", async (_what, error) => {
    const { api } = client({ renew: error, subscribe: error, remove: error });

    for (const asked of [
      api.renew(ID, GIVEN, ACCOUNT),
      api.subscribe(GIVEN, ACCOUNT),
      api.remove(ID, ACCOUNT),
    ]) {
      const failure = await caught(asked);
      expect(failure).toBe(error);
      expect(failure).not.toBeInstanceOf(PushRefused);
    }
  });
});
