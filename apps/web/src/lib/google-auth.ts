import { LOCALES } from "@repo/config/locales";

// What an address begins with in a language other than English, and the page after it.
const PREFIXED = new RegExp(`^(/(?:${LOCALES.filter((l) => l !== "en").join("|")}))(/.*)$`);

function splitLocale(pathname: string) {
  const [, prefix = "", page = pathname] = PREFIXED.exec(pathname) ?? [];
  return { prefix, page };
}

/** OAuth keeps the selected place, list and language across the external redirect. */
export function googleReturnURL(current: string) {
  const url = new URL(current);
  const { prefix, page } = splitLocale(url.pathname);
  if (page === "/login") {
    url.pathname = `${prefix}/app`;
    url.search = "";
    url.hash = "";
  }
  // The signed assistant request stays in sessionStorage, never in OAuth state.
  if (page === "/connect") url.hash = "";
  return url.href;
}

export function googleErrorURL(current: string) {
  const url = new URL(current);
  url.pathname = `${splitLocale(url.pathname).prefix}/login`;
  url.search = "";
  url.hash = "";
  const target = new URL(googleReturnURL(current));
  url.searchParams.set("returnTo", target.pathname + target.search + target.hash);
  return url.href;
}

/** A callback never turns a manually edited login URL into an external redirect. */
export function authReturnTo(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//"))
    return undefined;
  const base = "https://auth.invalid";
  const url = new URL(value, base);
  const { page } = splitLocale(url.pathname);
  if (url.origin !== base || !["/app", "/connect"].includes(page)) return undefined;
  if (page === "/connect") url.hash = "";
  return url.pathname + url.search + url.hash;
}
