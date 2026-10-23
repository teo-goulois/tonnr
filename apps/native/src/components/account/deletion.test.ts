import { describe, expect, it } from "vitest";

import {
  accountNamed,
  type DeletionRefusal,
  deleteLabel,
  deleteWithApple,
  refusalOf,
  refusalWords,
  signsInAgainWith,
} from "./deletion";

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

describe("an account of Apple's deleted from an iPhone", () => {
  type Sheet = { answered: true; authorizationCode: string | null; token: string };
  const sheet: Sheet = { answered: true, authorizationCode: "code-1", token: "token-1" };

  // The steps of a press, which write down what they were asked, in order.
  function steps(options: {
    answers?: Sheet | { answered: false; refusal?: string };
    refusals?: (DeletionRefusal | undefined)[];
    signIn?: { signedIn: true } | { signedIn: false; refusal?: string };
    signedInAs?: string;
  }) {
    const asked: string[] = [];
    const refusals = [...(options.refusals ?? [undefined])];
    return {
      asked,
      ask: async () => {
        asked.push("sheet");
        return options.answers ?? sheet;
      },
      send: async (password: string | undefined, code: string | undefined) => {
        asked.push(`delete ${password ?? "-"} ${code ?? "-"}`);
        return refusals.shift();
      },
      signIn: async (answered: Sheet) => {
        asked.push(`sign in ${answered.token}`);
        return options.signIn ?? { signedIn: true as const };
      },
      signedInAs: async () => options.signedInAs ?? "kai",
    };
  }

  it("asks the sheet, then sends its code with the deletion, a password with it", async () => {
    const press = steps({});
    expect(await deleteWithApple("hunter2", "kai", press)).toEqual({ deleted: true });
    expect(press.asked).toEqual(["sheet", "delete hunter2 code-1"]);
  });

  it("deletes a fresh session without signing in again", async () => {
    const press = steps({});
    expect(await deleteWithApple(undefined, "kai", press)).toEqual({ deleted: true });
    expect(press.asked).toEqual(["sheet", "delete - code-1"]);
  });

  it("deletes nothing when the sheet is closed, and says why when it failed", async () => {
    const closed = steps({ answers: { answered: false } });
    expect(await deleteWithApple(undefined, "kai", closed)).toEqual({ kept: true });
    expect(closed.asked).toEqual(["sheet"]);
    const failed = steps({ answers: { answered: false, refusal: "It didn't work." } });
    expect(await deleteWithApple(undefined, "kai", failed)).toEqual({
      kept: true,
      refusal: "It didn't work.",
    });
  });

  it("signs in again with the same token once the session is too old, and sends the same code", async () => {
    const press = steps({ refusals: ["session", undefined] });
    expect(await deleteWithApple(undefined, "kai", press)).toEqual({ deleted: true });
    expect(press.asked).toEqual(["sheet", "delete - code-1", "sign in token-1", "delete - code-1"]);
  });

  it("deletes nothing when the token signs in another account", async () => {
    const press = steps({ refusals: ["session"], signedInAs: "someone-else" });
    expect(await deleteWithApple(undefined, "kai", press)).toEqual({ other: true });
    expect(press.asked).toEqual(["sheet", "delete - code-1", "sign in token-1"]);
  });

  it("deletes nothing when the new sign-in fails", async () => {
    const press = steps({ refusals: ["session"], signIn: { signedIn: false, refusal: "No." } });
    expect(await deleteWithApple(undefined, "kai", press)).toEqual({ kept: true, refusal: "No." });
  });

  it("says a wrong password, which a new sign-in cannot mend", async () => {
    const press = steps({ refusals: ["password"] });
    expect(await deleteWithApple("wrong", "kai", press)).toEqual({ refused: "password" });
    expect(press.asked).toEqual(["sheet", "delete wrong code-1"]);
  });

  it("sends no code when the sheet gave none", async () => {
    const press = steps({ answers: { ...sheet, authorizationCode: null } });
    expect(await deleteWithApple(undefined, "kai", press)).toEqual({ deleted: true });
    expect(press.asked).toEqual(["sheet", "delete - -"]);
  });
});
