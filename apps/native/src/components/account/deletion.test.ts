import { describe, expect, it } from "vitest";

import { accountNamed, deleteLabel, refusalOf, refusalWords, signsInAgainWith } from "./deletion";

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
  });

  it("is said in the web's words", () => {
    expect(refusalWords("password")).toBe("That's not your password.");
    expect(refusalWords("session")).toBe("Sign in again first, then come back here.");
  });
});

describe("the account that is deleted", () => {
  it("is named by its username, or by its address before it has one", () => {
    expect(accountNamed({ username: "kai_reef", email: "kai@example.org" })).toBe("@kai_reef");
    expect(accountNamed({ username: null, email: "kai@example.org" })).toBe("kai@example.org");
  });

  it("is named on the button too", () => {
    expect(deleteLabel({ username: "kai_reef" })).toBe("Delete @kai_reef");
    expect(deleteLabel({ username: null })).toBe("Delete my account");
  });

  it("signs in again with its own providers alone, among those this phone offers", () => {
    expect(signsInAgainWith(["google"], ["apple", "google"])).toEqual(["google"]);
    expect(signsInAgainWith(["apple", "google"], ["google"])).toEqual(["google"]);
    expect(signsInAgainWith(["apple"], ["google"])).toEqual([]);
  });
});
