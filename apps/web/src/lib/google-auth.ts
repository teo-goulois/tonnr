/** OAuth keeps the selected place, list and language across the external redirect. */
export function googleReturnURL(current: string) {
  const url = new URL(current);
  if (url.pathname === "/login" || url.pathname === "/fr/login") {
    url.pathname = url.pathname.startsWith("/fr/") ? "/fr/app" : "/app";
    url.search = "";
    url.hash = "";
  }
  // The signed assistant request stays in sessionStorage, never in OAuth state.
  if (["/connect", "/fr/connect"].includes(url.pathname)) url.hash = "";
  return url.href;
}

export function googleErrorURL(current: string) {
  const url = new URL(current);
  url.pathname = url.pathname.startsWith("/fr/") ? "/fr/login" : "/login";
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
  if (url.origin !== base || !["/app", "/fr/app", "/connect", "/fr/connect"].includes(url.pathname))
    return undefined;
  if (["/connect", "/fr/connect"].includes(url.pathname)) url.hash = "";
  return url.pathname + url.search + url.hash;
}
