const READS = ["GET", "HEAD", "OPTIONS"];

/** The site a request says it comes from, by `Origin` or else by `Referer`. Null when it says none. */
function siteOf(request: { origin: string | null; referer: string | null }) {
  if (request.origin !== null) return request.origin;
  if (request.referer !== null && URL.canParse(request.referer)) {
    return new URL(request.referer).origin;
  }
  return null;
}

/**
 * Whether a request is a write that a page of another site may have made a browser send with
 * the visitor's cookie. A write that comes with a cookie has to name a site the instance
 * trusts, in `Origin` or else in `Referer`: one that names another site, or none, is refused.
 * A request without a cookie has no session to borrow, and a read changes nothing.
 */
export function isCrossSiteWrite(
  request: { method: string; origin: string | null; referer: string | null; hasCookie: boolean },
  trustedOrigins: readonly string[],
) {
  if (READS.includes(request.method.toUpperCase()) || !request.hasCookie) return false;

  const site = siteOf(request);
  return site === null || !trustedOrigins.includes(site);
}
