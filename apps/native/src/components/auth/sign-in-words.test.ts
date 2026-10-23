import { afterEach, describe, expect, it } from "vitest";

import { m } from "@/paraglide/messages";
import { baseLocale, setLocale } from "@/paraglide/runtime.js";

import {
  emailSchema,
  insideNext,
  PASSWORD_RULES,
  passwordSchema,
  refusalWords,
  signInParams,
} from "./sign-in-words";

/** What a schema says is wrong with a value, or nothing. */
const faultOf = (
  schema: { safeParse: (value: unknown) => { error?: { issues: { message: string }[] } } },
  value: string,
) => schema.safeParse(value).error?.issues[0]?.message;

afterEach(() => {
  void setLocale(baseLocale, { reload: false });
});

describe("the sheet that signs in", () => {
  it("opens on signing in, and on creating an account when asked or when a link brought the visitor", () => {
    expect(signInParams({}).mode).toBe("sign-in");
    expect(signInParams({ mode: "sign-up" }).mode).toBe("sign-up");
    expect(signInParams({ invite: "abc123" })).toMatchObject({ mode: "sign-up", invite: "abc123" });
  });

  it("says what it was opened for, and nothing for a reason left empty", () => {
    expect(signInParams({ reason: "Sign in to save Hossegor." }).reason).toBe(
      "Sign in to save Hossegor.",
    );
    expect(signInParams({ reason: "  " }).reason).toBeUndefined();
    expect(signInParams({ reason: ["first", "second"] }).reason).toBe("first");
  });

  it("knows which prompt opened it, and none when it was opened from elsewhere", () => {
    expect(signInParams({ follow: "3" }).follow).toBe("3");
    expect(signInParams({}).follow).toBeUndefined();
    expect(signInParams({ follow: " " }).follow).toBeUndefined();
  });

  it("goes on to a screen of the app, and never to another address", () => {
    expect(insideNext("/alert/new?place=break:12")).toBe("/alert/new?place=break:12");
    expect(insideNext("//evil.example/path")).toBeUndefined();
    expect(insideNext("https://evil.example")).toBeUndefined();
    expect(insideNext("/redirect?to=https://evil.example")).toBeUndefined();
    expect(insideNext("account")).toBeUndefined();
    expect(insideNext(undefined)).toBeUndefined();
  });
});

describe("what a form of the sign-in says is wrong", () => {
  it("takes an address as the web's forms do, whatever spaces the keyboard left around it", () => {
    expect(faultOf(emailSchema(), " surfer@example.com ")).toBeUndefined();
    expect(faultOf(emailSchema(), "surfer@example")).toBe(m.auth_email_invalid());
    expect(faultOf(emailSchema(), "surfer")).toBe(m.auth_email_invalid());
    // An address the API would refuse is refused here first, as on the web.
    expect(faultOf(emailSchema(), "a..b@example.com")).toBe(m.auth_email_invalid());
  });

  it("says what is wrong in the language in force as the form is drawn", () => {
    void setLocale("fr", { reload: false });
    expect(faultOf(emailSchema(), "surfer")).toBe(m.auth_email_invalid());
    expect(faultOf(passwordSchema(), "court")).toBe(m.auth_password_too_short());
  });

  it("takes a password of eight characters at least, as the library does", () => {
    expect(faultOf(passwordSchema(), "1234567")).toBe(m.auth_password_too_short());
    expect(faultOf(passwordSchema(), "12345678")).toBeUndefined();
  });

  it("tells iOS's passwords the lengths the library takes", () => {
    expect(PASSWORD_RULES).toBe("minlength: 8; maxlength: 128;");
  });

  it("says a suspended account and a refused username in the reader's language", () => {
    void setLocale("fr", { reload: false });
    expect(refusalWords("ACCOUNT_SUSPENDED", "Account suspended")).toBe(m.auth_suspended());
    expect(refusalWords("USERNAME_IS_ALREADY_TAKEN")).toBe(m.username_taken());
  });

  it("says the library's own words for another refusal, or that it did not work", () => {
    expect(refusalWords("INVALID_EMAIL_OR_PASSWORD", "Invalid email or password")).toBe(
      "Invalid email or password",
    );
    expect(refusalWords(undefined)).toBe(m.auth_failed());
  });
});
