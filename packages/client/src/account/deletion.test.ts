import { describe, expect, it } from "vitest";

import { accountNamed, refusalOf, refusalWords } from "./deletion";

// The words of `apps/web/messages/en.json`.
const WORDS = {
  delete_account_wrong_password: () => "That's not your password.",
  delete_account_stale: () => "Sign in again first, then come back here.",
  delete_account_many: () => "Too many wrong passwords. Try again once this hour is over.",
  delete_account_operator: () =>
    "An operator's account can't be deleted. Its operator rights have to go first.",
  delete_account_failed: () => "Your account couldn't be deleted. Try again.",
};

describe("a refusal to delete the account", () => {
  it("is read by its code, and a session by what the API says of it", () => {
    expect(refusalOf({ code: "FORBIDDEN", data: { refused: "session" } })).toBe("session");
    expect(refusalOf({ code: "FORBIDDEN", data: { refused: "password" } })).toBe("password");
    expect(refusalOf({ code: "FORBIDDEN" })).toBe("password");
    expect(refusalOf({ code: "TOO_MANY_REQUESTS" })).toBe("many");
    expect(refusalOf({ code: "CONFLICT" })).toBe("operator");
    expect(refusalOf({ code: "INTERNAL_SERVER_ERROR" })).toBe("failed");
    expect(refusalOf(new TypeError("Network request failed"))).toBe("failed");
    expect(refusalOf(null)).toBe("failed");
    expect(refusalOf(undefined)).toBe("failed");
  });

  it("is said in the words the app gives", () => {
    expect(refusalWords("password", WORDS)).toBe(WORDS.delete_account_wrong_password());
    expect(refusalWords("session", WORDS)).toBe(WORDS.delete_account_stale());
    expect(refusalWords("operator", WORDS)).toBe(WORDS.delete_account_operator());
  });
});

describe("the account that is deleted", () => {
  it("is named by its username, or by its address before it has one", () => {
    expect(accountNamed({ username: "kai_reef", email: "kai@example.org" })).toBe("@kai_reef");
    expect(accountNamed({ username: null, email: "kai@example.org" })).toBe("kai@example.org");
  });
});
