import { describe, expect, it } from "vitest";

import { m } from "@/paraglide/messages";

import { typedUsername, usernameFault, usernameRefusal, usernameSays } from "./username";

describe("a username, as the app checks it before it asks", () => {
  it("is kept in small letters, without spaces around it", () => {
    expect(typedUsername("  Kelly_S ")).toBe("kelly_s");
  });

  it("says why a text is no username, by the rules the API keeps", () => {
    expect(usernameFault("ab")).toBe(m.username_too_short());
    expect(usernameFault("a".repeat(21))).toBe(m.username_too_long());
    expect(usernameFault("josé")).toBe(m.username_characters());
    expect(usernameFault("admin")).toBe(m.username_reserved());
    expect(usernameFault("kelly_s")).toBeUndefined();
  });

  it("does not tell a name still being typed that it is short, until it is sent", () => {
    expect(usernameSays({ username: "ke", isFree: undefined, wasSent: false })).toEqual({
      hint: m.username_hint(),
    });
    expect(usernameSays({ username: "ke", isFree: undefined, wasSent: true })).toEqual({
      error: m.username_too_short(),
    });
  });

  it("says whether the API found it free, and what it refused it for", () => {
    expect(usernameSays({ username: "kelly", isFree: true, wasSent: false })).toEqual({
      hint: m.username_free(),
    });
    expect(usernameSays({ username: "kelly", isFree: false, wasSent: false })).toEqual({
      error: m.username_taken(),
    });
    const refusal = { of: "kelly", why: m.username_failed() };
    expect(usernameSays({ username: "kelly", isFree: true, wasSent: true, refusal })).toEqual({
      error: m.username_failed(),
    });
    // Once another name is typed, the refusal of the first one is not said of it.
    expect(usernameSays({ username: "kelly2", isFree: true, wasSent: true, refusal })).toEqual({
      hint: m.username_free(),
    });
  });

  it("words the library's refusals of a username, and leaves the others to it", () => {
    expect(usernameRefusal("USERNAME_IS_ALREADY_TAKEN")).toBe(m.username_taken());
    expect(usernameRefusal("INVALID_USERNAME")).toBe(m.username_reserved());
    expect(usernameRefusal("INVALID_EMAIL")).toBeUndefined();
  });
});
