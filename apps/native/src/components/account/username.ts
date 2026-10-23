import {
  liveUsernameFault as liveFaultIn,
  typedUsername,
  usernameFault as faultIn,
  type UsernameMessages,
  usernameRefusal as refusalIn,
} from "@repo/client/username";
import { USERNAME_MIN } from "@repo/config/username";

import { m } from "@/paraglide/messages";

// The rules of a username, which is what others read of an account (decision 041), in the app's
// words: `packages/client/src/username.ts` says them for both apps, and `packages/config/src/
// username.ts` what a username is, for the API too. A module that imports nothing of React
// Native, so that a test reads it.

export { typedUsername };

const WORDS: UsernameMessages = {
  username_too_short: m.username_too_short,
  username_too_long: m.username_too_long,
  username_characters: m.username_characters,
  username_reserved: m.username_reserved,
  username_insult: m.username_insult,
  username_taken: m.username_taken,
};

/** Why a text is no username, in the reader's language. Undefined for one that is. */
export const usernameFault = (username: string) => faultIn(username, WORDS);

/**
 * What a username field says as it is typed: what is wrong with the name once it is long enough
 * to be one. Given as the field's `onChange` validator, as the web's.
 */
export const liveUsernameFault = ({ value }: { value: string }) => liveFaultIn(value, WORDS);

/**
 * What a refusal of the sign-in library says of a username, in the reader's language. Undefined
 * for a refusal of something else, which the library words itself.
 */
export const usernameRefusal = (code: string | undefined) => refusalIn(code, WORDS);

/**
 * What a field of a username says under it, for a form that keeps its state by hand, as the
 * sign-up's: what is wrong, said once the name is long enough to be judged or once it was sent,
 * then whether the API said it is taken; else that it is free, or the rules.
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
