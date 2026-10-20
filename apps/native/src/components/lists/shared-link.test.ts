import { afterEach, describe, expect, it, vi } from "vitest";

const kept = new Map<string, string>();

// The phone's keychain, which a test does not have: a map stands for it.
vi.mock("expo-secure-store", () => ({
  getItemAsync: async (key: string) => kept.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => void kept.set(key, value),
  deleteItemAsync: async (key: string) => void kept.delete(key),
}));

const { holdLink, keepPass, keptPass, linkHeaders } = await import("./shared-link");

const releases: (() => void)[] = [];
const hold = (token: string, pass: string | null) => releases.push(holdLink(token, pass));

afterEach(() => {
  for (const release of releases.splice(0)) release();
  kept.clear();
});

describe("the link a shared list is read with", () => {
  it("tells the API nothing while no screen holds a link", () => {
    expect(linkHeaders(null)).toEqual({});
  });

  it("tells it the link held last, with what stands for its password", () => {
    hold("one", null);
    expect(linkHeaders(null)).toEqual({ Authorization: "List one" });
    hold("two", "f00d");
    expect(linkHeaders("")).toEqual({ Authorization: "List two.f00d" });
  });

  it("goes back to the link held before once the last one is let go, and to none after", () => {
    hold("one", null);
    const second = holdLink("two", null);
    second();
    expect(linkHeaders(null)).toEqual({ Authorization: "List one" });
    for (const release of releases.splice(0)) release();
    expect(linkHeaders(null)).toEqual({});
  });

  it("lets go of one link alone, whichever was held first", () => {
    const first = holdLink("one", null);
    hold("two", null);
    first();
    expect(linkHeaders(null)).toEqual({ Authorization: "List two" });
  });

  it("never names a link beside the cookie of a session: an account reads as itself", () => {
    hold("one", null);
    expect(linkHeaders("__Secure-tonnr.session_token=abc; tonnr.session_data=x")).toEqual({});
    expect(linkHeaders("other=1")).toEqual({ Authorization: "List one" });
  });
});

describe("what stands for a link's password, kept on the phone", () => {
  it("is kept by link, and forgotten for a link that asks none", async () => {
    expect(await keptPass("tok")).toBeUndefined();
    await keepPass("tok", "f00d");
    expect(await keptPass("tok")).toBe("f00d");
    expect(await keptPass("other")).toBeUndefined();
    await keepPass("tok", null);
    expect(await keptPass("tok")).toBeUndefined();
  });
});
