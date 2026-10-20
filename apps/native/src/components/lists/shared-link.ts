import { APP_SLUG } from "@repo/config/app";
import * as SecureStore from "expo-secure-store";

import { linkAuthorizationOf } from "./links";

// The link of a shared list the app reads with while nobody is signed in, as the web's
// `apps/web/src/lib/shared-link.ts` does: the API takes it in `Authorization`, as it takes a
// key, and judges the request on it alone (decision 035). A screen that shows the list holds the
// link while it is open, and the last one held is what the API is told. An account is never
// read by a link: it reads with its session, and a list it kept with its id.

type Held = { token: string; pass: string | null };

const held: Held[] = [];

/** Reads with a list's link, and what stands for its password, until what it answers is called. */
export function holdLink(token: string, pass: string | null) {
  const one: Held = { token, pass };
  held.push(one);
  return () => {
    const index = held.indexOf(one);
    if (index !== -1) held.splice(index, 1);
  };
}

/**
 * What the API is told of the link, beside the session's cookie the app keeps: nothing once the
 * cookie names a session, which the sign-in library reads as `session_token` too.
 */
export function linkHeaders(cookie: string | null | undefined): { Authorization?: string } {
  const last = held.at(-1);
  if (!last || cookie?.includes("session_token")) return {};
  return { Authorization: linkAuthorizationOf(last.token, last.pass) };
}

// What stands for a link's password, kept in the phone's keychain or keystore by link, as the
// web keeps it in the browser: whoever uses the phone reads the list.
const keyOf = (token: string) => `${APP_SLUG}.shared.${token}`;

/** What stands for a link's password on this phone, once it was given. */
export async function keptPass(token: string) {
  try {
    return (await SecureStore.getItemAsync(keyOf(token))) ?? undefined;
  } catch {
    return undefined;
  }
}

/** Keeps what stands for a link's password, or forgets it for a link that asks none. */
export async function keepPass(token: string, pass: string | null) {
  try {
    if (pass) await SecureStore.setItemAsync(keyOf(token), pass);
    else await SecureStore.deleteItemAsync(keyOf(token));
  } catch {
    // A phone that keeps nothing asks for the password again.
  }
}
