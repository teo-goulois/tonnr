import { m } from "@/paraglide/messages";

import { usernameRefusal } from "../account/username";

// What the sheet that signs in reads of its address and says of a refusal, in the web's words
// (`AuthForm`, `LoginWall`): decisions 039, 041 and 070. A module that imports nothing of React
// Native, so that a test reads it.

export type AuthMode = "sign-in" | "sign-up";

// The lengths the sign-in library takes a password of, as a sign-up checks them.
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

// An address as a person writes one: something, an at sign, a domain with a dot. The library
// says the rest.
const ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Why a text is no address, in the reader's language. Undefined for one that is. */
export function emailFault(email: string) {
  return ADDRESS.test(email.trim()) ? undefined : m.auth_email_invalid();
}

/** Why a text is no password the library takes. Undefined for one that is. */
export function passwordFault(password: string) {
  return password.length < PASSWORD_MIN ? m.auth_password_too_short() : undefined;
}

/**
 * Why a sign-in or a sign-up was refused, in the reader's language: a suspended account and a
 * username the library does not take, as the web says them; the rest as the library words it,
 * or that it did not work.
 */
export function refusalWords(code: string | undefined, message?: string | undefined) {
  if (code === "ACCOUNT_SUSPENDED") return m.auth_suspended();
  return usernameRefusal(code) ?? (message || m.auth_failed());
}

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * Where the sheet goes once signed in: a screen of the app, by its path, and never another
 * address, whatever was written in the link that opened it.
 */
export function insideNext(value: string | string[] | undefined) {
  const next = one(value);
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("://")) {
    return undefined;
  }
  return next;
}

/**
 * What the sheet that signs in was opened with: why an account is needed, where to go after, the
 * link someone gave the visitor, which goes with a sign-up (decision 041), and whether it opens
 * on creating an account, which whoever comes by a link comes to do.
 */
export function signInParams(params: Record<string, string | string[] | undefined>) {
  const reason = one(params.reason)?.trim() || undefined;
  const invite = one(params.invite)?.trim() || undefined;
  const mode: AuthMode = one(params.mode) === "sign-up" || invite ? "sign-up" : "sign-in";
  // Which prompt opened the sheet, whose follow-up it runs once signed in.
  const follow = one(params.follow)?.trim() || undefined;
  return { reason, next: insideNext(params.next), invite, mode, follow };
}
