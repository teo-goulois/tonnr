import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-client", () => ({ authClient: {} }));

import { type AccountDeletion, DeleteAccount, refusalOf } from "./delete-account";

// The step that deletes the account: what it asks first, and whom it names. Decision 071.

afterEach(cleanup);

const deletionOf = (given: Partial<AccountDeletion>): AccountDeletion => ({
  account: "@kai_reef",
  hasPassword: true,
  signsInAgainWith: ["google"],
  isDeleting: false,
  signingIn: undefined,
  refused: undefined,
  onDelete: vi.fn(),
  onSignInAgain: vi.fn(),
  ...given,
});
const show = (given: Partial<AccountDeletion>) => {
  const deletion = deletionOf(given);
  render(createElement(DeleteAccount, { deletion }));
  return deletion;
};

describe("the step that deletes the account", () => {
  it("names the account it deletes, and asks its password first", () => {
    const deletion = show({});
    expect(
      screen.getByText(/This deletes @kai_reef, the account you're signed in with/),
    ).toBeTruthy();
    const button = screen.getByRole("button", { name: "Delete @kai_reef" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Your password"), { target: { value: "a password" } });
    fireEvent.click(button);
    expect(deletion.onDelete).toHaveBeenCalledWith("a password");
  });

  it("names an account without a username by its address", () => {
    show({ account: "kai@example.org", hasPassword: false });
    expect(screen.getByText(/This deletes kai@example.org/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete my account" })).toBeTruthy();
  });

  it("deletes an account without a password in one press, whatever the device's clock says", () => {
    const deletion = show({ hasPassword: false });
    expect(screen.queryByRole("button", { name: "Continue with Google" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Delete @kai_reef" }));
    expect(deletion.onDelete).toHaveBeenCalledWith(undefined);
  });

  it("asks it to sign in again with its own providers once the API finds its session too old", () => {
    const deletion = show({
      hasPassword: false,
      refused: "session",
      signsInAgainWith: ["apple", "google"],
    });
    expect(screen.getByText(/Your session is too old/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Delete/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Continue with Apple" }));
    expect(deletion.onSignInAgain).toHaveBeenCalledWith("apple");
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeTruthy();
  });

  it("says what to do when the instance no longer offers the way it signs in", () => {
    show({ hasPassword: false, refused: "session", signsInAgainWith: [] });
    expect(screen.getByText(/no longer offers the way you sign in/)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("says why the API refused", () => {
    show({ refused: "password" });
    expect(screen.getByRole("alert").textContent).toBe("That's not your password.");
  });
});

describe("a refusal of the API", () => {
  it("is read by its code, and a session by what it says", () => {
    expect(refusalOf({ code: "FORBIDDEN", data: { refused: "session" } })).toBe("session");
    expect(refusalOf({ code: "FORBIDDEN", data: { refused: "password" } })).toBe("password");
    expect(refusalOf({ code: "FORBIDDEN" })).toBe("password");
    expect(refusalOf({ code: "TOO_MANY_REQUESTS" })).toBe("many");
    expect(refusalOf({ code: "CONFLICT" })).toBe("operator");
    expect(refusalOf({ code: "INTERNAL_SERVER_ERROR" })).toBe("failed");
    expect(refusalOf(new TypeError("fetch failed"))).toBe("failed");
  });
});
