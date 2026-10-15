/**
 * Makes permanent a redirect to the same page written another way. The router sends `/fr` to
 * `/fr/` and `/sources/` to `/sources`, with a 307 of its own, because the address it builds for a
 * page is not the one asked for. That address never changes, so a search engine should keep the
 * new one: a 308 says so. A redirect to another page, or to the other language, is left alone.
 */
export function permanentWhenSamePage(request: Request, response: Response): Response {
  if (response.status !== 307) return response;
  const location = response.headers.get("Location");
  if (location === null) return response;

  const from = new URL(request.url);
  const to = new URL(location, from);
  // The host is not compared: behind a proxy the request may name another than the one the
  // router writes, and the router never sends a page to another host.
  if (to.search !== from.search || withoutSlash(to.pathname) !== withoutSlash(from.pathname)) {
    return response;
  }
  return new Response(response.body, { status: 308, headers: response.headers });
}

function withoutSlash(path: string) {
  return path.replace(/\/+$/, "");
}
