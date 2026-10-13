import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestUrl } from "@tanstack/react-start/server";

/**
 * The address the site is read at, without a path: the request's on the server, behind whatever
 * forwards it, and the page's in a browser. No variable says it, so a stage needs none.
 */
export const siteOrigin = createIsomorphicFn()
  .server(() => getRequestUrl({ xForwardedHost: true, xForwardedProto: true }).origin)
  .client(() => window.location.origin);

/** The API's address, without the slash a setting may end with. */
export function apiOrigin(serverUrl: string) {
  return serverUrl.replace(/\/$/, "");
}
