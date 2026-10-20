import { beforeEach, describe, expect, it, vi } from "vitest";

const kept = new Map<string, { value: string; access: unknown }>();
let locked = false;

// The phone's keychain, which a test does not have: a map stands for it, which refuses to be
// read while the phone is locked, as iOS refuses an item kept with the keychain's default.
vi.mock("expo-secure-store", () => ({
  AFTER_FIRST_UNLOCK: "after-first-unlock",
  getItem: (key: string) => {
    if (locked) throw new Error("User interaction is not allowed.");
    return kept.get(key)?.value ?? null;
  },
  setItem: (key: string, value: string, options?: { keychainAccessible?: unknown }) =>
    void kept.set(key, { value, access: options?.keychainAccessible }),
  setItemAsync: async (key: string, value: string, options?: { keychainAccessible?: unknown }) =>
    void kept.set(key, { value, access: options?.keychainAccessible }),
}));
vi.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "es" }] }));

const { chooseLocale, startingLocale } = await import("./i18n");

beforeEach(() => {
  kept.clear();
  locked = false;
});

describe("the app's language", () => {
  it("is the phone's first that the product speaks until one is chosen", () => {
    expect(startingLocale()).toBe("es");
  });

  it("is kept readable once the phone was unlocked, as the session is", () => {
    chooseLocale("fr");
    expect(kept.get("locale")).toEqual({ value: "fr", access: "after-first-unlock" });
    expect(startingLocale()).toBe("fr");
  });

  it("is written again with that access when it was kept before with the default", async () => {
    kept.set("locale", { value: "pt", access: undefined });
    expect(startingLocale()).toBe("pt");
    await Promise.resolve();
    expect(kept.get("locale")?.access).toBe("after-first-unlock");
  });

  it("falls back to the phone's when the keychain cannot be read, and throws nothing", () => {
    chooseLocale("fr");
    locked = true;
    expect(startingLocale()).toBe("es");
  });
});
