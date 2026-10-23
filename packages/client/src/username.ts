import {
  USERNAME_INSULT,
  USERNAME_MIN,
  type UsernameProblem,
  usernameProblem,
} from "@repo/config/username";

// What the web app and the app for phones say of a username before they send it, and of the
// sign-in library's refusals of one, in the words each app gives: `packages/config/src/
// username.ts` says what a username is, for the API too. A username is what others read of an
// account: decision 041.

/** The words of a username's faults, which each app gives from its messages. */
export type UsernameMessages = {
  username_too_short: () => string;
  username_too_long: () => string;
  username_characters: () => string;
  username_reserved: () => string;
  username_insult: () => string;
  username_taken: () => string;
};

const FAULTS: Record<UsernameProblem, keyof UsernameMessages> = {
  short: "username_too_short",
  long: "username_too_long",
  characters: "username_characters",
  reserved: "username_reserved",
  insult: "username_insult",
};

/** What is typed as a username, as it is kept: in small letters, without spaces around it. */
export const typedUsername = (typed: string) => typed.trim().toLowerCase();

/** Why a text is no username, in the reader's language. Undefined for one that is. */
export function usernameFault(username: string, messages: UsernameMessages) {
  const problem = usernameProblem(username);
  return problem ? messages[FAULTS[problem]]() : undefined;
}

/**
 * What a username field says as it is typed: what is wrong with the name once it is long enough
 * to be one. A name still being typed is not told that it is short: the form says so once it is
 * sent (decision 076).
 */
export function liveUsernameFault(typed: string, messages: UsernameMessages) {
  const username = typedUsername(typed);
  return username.length >= USERNAME_MIN ? usernameFault(username, messages) : undefined;
}

/**
 * Whether the API is asked if a username is free: a text that is a username, and not the
 * account's own.
 */
export const asksIfFree = (username: string, own?: string | null) =>
  usernameProblem(username) === null && username !== own;

/**
 * What a refusal of the sign-in library says of a username, in the reader's language. Undefined
 * for a refusal of something else, which the library words itself.
 */
export function usernameRefusal(code: string | undefined, messages: UsernameMessages) {
  if (code === "USERNAME_IS_ALREADY_TAKEN") return messages.username_taken();
  if (code === "USERNAME_TOO_SHORT") return messages.username_too_short();
  if (code === "USERNAME_TOO_LONG") return messages.username_too_long();
  if (code === "INVALID_USERNAME") return messages.username_reserved();
  if (code === USERNAME_INSULT) return messages.username_insult();
  return undefined;
}
