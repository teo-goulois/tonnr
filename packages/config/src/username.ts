import { APP_NAME, APP_SLUG } from "./app";

// A username is what others read of an account: on a line of a guide it wrote, and among its
// friends. Decision 041. The sign-in library holds it, and the web app checks it with the same
// rules before it asks.
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;

// Letters without accents, digits and the underscore: what reads the same in an address and in a
// sentence, whatever the keyboard.
const CHARACTERS = /^[A-Za-z0-9_]+$/;

// Names nobody takes: read beside a guide, they would be the instance speaking.
const RESERVED = new Set([
  APP_NAME.toLowerCase(),
  APP_SLUG.toLowerCase(),
  "admin",
  "administrator",
  "anonymous",
  "api",
  "deleted",
  "everyone",
  "help",
  "mod",
  "moderator",
  "nobody",
  "null",
  "official",
  "operator",
  "root",
  "security",
  "staff",
  "support",
  "system",
  "team",
  "undefined",
]);

export type UsernameProblem = "short" | "long" | "characters" | "reserved";

/**
 * Why a text is no username, or null for one that is. Whether another account has it is the
 * database's to say.
 */
export function usernameProblem(given: string): UsernameProblem | null {
  if (given.length < USERNAME_MIN) return "short";
  if (given.length > USERNAME_MAX) return "long";
  if (!CHARACTERS.test(given)) return "characters";
  if (RESERVED.has(given.toLowerCase())) return "reserved";
  return null;
}
