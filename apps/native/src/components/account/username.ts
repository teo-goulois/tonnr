import { USERNAME_MIN, type UsernameProblem, usernameProblem } from "@repo/config/username";

import { m } from "@/paraglide/messages";

// The rules of a username, which is what others read of an account (decision 041), as the web's
// `UsernameForm` says them: `packages/config/src/username.ts` holds them for the API and both
// apps. A module that imports nothing of React Native, so that a test reads it.

const FAULTS: Record<UsernameProblem, () => string> = {
  short: m.username_too_short,
  long: m.username_too_long,
  characters: m.username_characters,
  reserved: m.username_reserved,
};

/** What is typed as a username, as it is kept: in small letters, without spaces around it. */
export const typedUsername = (typed: string) => typed.trim().toLowerCase();

/** Why a text is no username, in the reader's language. Undefined for one that is. */
export function usernameFault(username: string) {
  const problem = usernameProblem(username);
  return problem ? FAULTS[problem]() : undefined;
}

/**
 * What a refusal of the sign-in library says of a username, in the reader's language. Undefined
 * for a refusal of something else, which the library words itself.
 */
export function usernameRefusal(code: string | undefined) {
  if (code === "USERNAME_IS_ALREADY_TAKEN") return m.username_taken();
  if (code === "USERNAME_TOO_SHORT") return m.username_too_short();
  if (code === "USERNAME_TOO_LONG") return m.username_too_long();
  if (code === "INVALID_USERNAME") return m.username_reserved();
  return undefined;
}

/**
 * What a field of a username says under it: what is wrong, said once the name is long enough to
 * be judged or once it was sent, then whether the API said it is taken; else that it is free, or
 * the rules.
 */
export function usernameSays({
  username,
  isFree,
  wasSent,
  refusal,
}: {
  username: string;
  // What the API answered for this name: undefined while it has not.
  isFree: boolean | undefined;
  wasSent: boolean;
  // Why the API refused it when it was sent, for the name it was sent with.
  refusal?: { of: string; why: string } | undefined;
}): { error?: string; hint?: string } {
  const fault = wasSent || username.length >= USERNAME_MIN ? usernameFault(username) : undefined;
  const error =
    (refusal?.of === username ? refusal.why : undefined) ??
    fault ??
    (isFree === false ? m.username_taken() : undefined);
  if (error) return { error };
  return { hint: isFree ? m.username_free() : m.username_hint() };
}
