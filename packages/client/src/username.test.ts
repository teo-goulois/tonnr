import { describe, expect, it } from "vitest";

import {
  asksIfFree,
  liveUsernameFault,
  typedUsername,
  usernameFault,
  usernameRefusal,
} from "./username";

// The words of `apps/web/messages/en.json`.
const WORDS = {
  username_too_short: () => "Use at least 3 characters.",
  username_too_long: () => "Use 20 characters at most.",
  username_characters: () => "Use letters without accents, digits or _.",
  username_reserved: () => "This username is not available.",
  username_taken: () => "This username is taken.",
};

describe("a username, as both apps check it before they ask", () => {
  it("is kept in small letters, without spaces around it", () => {
    expect(typedUsername("  Kelly_S ")).toBe("kelly_s");
  });

  it("says why a text is no username, by the rules the API keeps", () => {
    expect(usernameFault("ab", WORDS)).toBe(WORDS.username_too_short());
    expect(usernameFault("a".repeat(21), WORDS)).toBe(WORDS.username_too_long());
    expect(usernameFault("josé", WORDS)).toBe(WORDS.username_characters());
    expect(usernameFault("admin", WORDS)).toBe(WORDS.username_reserved());
    expect(usernameFault("kelly_s", WORDS)).toBeUndefined();
  });

  it("does not tell a name still being typed that it is short", () => {
    expect(liveUsernameFault("ke", WORDS)).toBeUndefined();
    expect(liveUsernameFault("Admin", WORDS)).toBe(WORDS.username_reserved());
    expect(liveUsernameFault("kel ly", WORDS)).toBe(WORDS.username_characters());
    expect(liveUsernameFault("kelly", WORDS)).toBeUndefined();
  });

  it("asks whether a username is free, not a text that is none nor the account's own", () => {
    expect(asksIfFree("kelly")).toBe(true);
    expect(asksIfFree("kelly", "kelly")).toBe(false);
    expect(asksIfFree("ke")).toBe(false);
  });

  it("words the library's refusals of a username, and leaves the others to it", () => {
    expect(usernameRefusal("USERNAME_IS_ALREADY_TAKEN", WORDS)).toBe(WORDS.username_taken());
    expect(usernameRefusal("INVALID_USERNAME", WORDS)).toBe(WORDS.username_reserved());
    expect(usernameRefusal("INVALID_EMAIL", WORDS)).toBeUndefined();
    expect(usernameRefusal(undefined, WORDS)).toBeUndefined();
  });
});
