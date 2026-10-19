const READS = ["GET", "HEAD", "OPTIONS"];

/**
 * The site a request says it comes from: by `Origin`, else by the origin an app of the instance
 * names itself by in `expo-origin`, else by `Referer`. Null when it says none. A browser writes
 * `Origin` on every write a page sends, and sends `expo-origin` to the API from another site only
 * after asking leave, which CORS refuses: only a program sends it bare, as the app does.
 * Decision 069.
 */
export function siteOf(request: {
  origin: string | null;
  referer: string | null;
  appOrigin?: string | null;
}) {
  if (request.origin !== null) return request.origin;
  if (request.appOrigin && isAppOrigin(request.appOrigin)) return request.appOrigin;
  if (request.referer !== null && URL.canParse(request.referer)) {
    return new URL(request.referer).origin;
  }
  return null;
}

/**
 * Whether a request is a write that a page of another site may have made a browser send with
 * the visitor's cookie. A write that comes with a cookie has to name a site the instance
 * trusts, in `Origin`, else as an app in `expo-origin`, else in `Referer`: one that names another
 * site, or none, is refused. A request without a cookie has no session to borrow, and a read
 * changes nothing.
 */
export function isCrossSiteWrite(
  request: {
    method: string;
    origin: string | null;
    referer: string | null;
    appOrigin?: string | null;
    hasCookie: boolean;
  },
  trustedOrigins: readonly string[],
) {
  if (READS.includes(request.method.toUpperCase()) || !request.hasCookie) return false;

  const site = siteOf(request);
  return site === null || !trustedOrigins.includes(site);
}

// A scheme and its two slashes, and nothing after: `app.tonnr://`. A web address is a site, not
// an app, and is refused here, as is `null`, which a browser gives a page it will not name.
const APP_ORIGIN = /^[a-z][a-z0-9+.-]*:\/\/$/;
const NOT_AN_APP = /^(https?|file|data|blob|javascript|about|null):/;

/** Whether an origin is an app's, such as `app.tonnr://`, and no site's. */
export function isAppOrigin(origin: string) {
  return APP_ORIGIN.test(origin) && !NOT_AN_APP.test(origin);
}

/**
 * The origins the instance's apps for phones name themselves by, from the setting that lists
 * them, separated by commas, or else the one of the apps this repository builds. Each is compared
 * as it is written, never through `URL`: the origin of `app.tonnr://` would read as "null".
 * Decision 069.
 */
export function appOriginsOf(setting: string | undefined, scheme: string) {
  const origins = (setting ?? `${scheme}://`)
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin !== "");
  for (const origin of origins) {
    if (!isAppOrigin(origin)) {
      throw new Error(`APP_ORIGINS takes origins such as "app.example://", not ${origin}`);
    }
  }
  return [...new Set(origins)];
}

/**
 * Whether a request comes from a site that may run the instance. It has to name one: a request
 * that names no site is refused, since a page at the API's own address reads the answer to such
 * a request. A script names the site itself, as it does on a write.
 */
export function isFromAdminSite(site: string | null, adminSites: readonly string[]) {
  return site !== null && adminSites.includes(site);
}

/**
 * The sites that may run the instance: the admin app's when the instance names one, and
 * otherwise the API's own, which is then where its operator's scripts say they come from.
 */
export function adminSitesOf(env: { BETTER_AUTH_URL: string; ADMIN_ORIGIN?: string | undefined }) {
  return [new URL(env.ADMIN_ORIGIN ?? env.BETTER_AUTH_URL).origin];
}
