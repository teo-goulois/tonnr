// The link of a shared list this browser reads with while nobody is signed in: decision 035. The
// API takes it in `Authorization`, as it takes a key, and judges the request on it alone.
let header: string | null = null;

/** Reads with a list's link from now on, and with what stands for its password. */
export function readWithLink(token: string, pass: string | null) {
  header = `List ${token}${pass ? `.${pass}` : ""}`;
}

/** Reads as the session does, or as no one. */
export function readWithoutLink() {
  header = null;
}

/** What the API is told of the link, or undefined when it is told of none. */
export function linkAuthorization() {
  return header ?? undefined;
}

const keyOf = (token: string) => `tonnr:shared:${token}`;

/**
 * What stands for a link's password in this browser, once it was given. Empty for a link that
 * asked none, and undefined for a link that was never opened here.
 */
export function keptPass(token: string) {
  try {
    return localStorage.getItem(keyOf(token)) ?? undefined;
  } catch {
    return undefined;
  }
}

export function keepPass(token: string, pass: string | null) {
  try {
    localStorage.setItem(keyOf(token), pass ?? "");
  } catch {
    // A browser that keeps nothing asks for the password again.
  }
}

export function forgetPass(token: string) {
  try {
    localStorage.removeItem(keyOf(token));
  } catch {
    // Nothing was kept.
  }
}
