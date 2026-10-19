const HOSTS = ["https://eu.i.posthog.com", "https://us.i.posthog.com"];

// Where PostHog's clients post events, and nothing else they ask: posthog-js in the browser
// posts to `e/` and `i/v0/e/`, and posthog-react-native in the app for phones posts a batch to
// `batch/`, as `getBatchEndpointPath` in its core, @posthog/core, says (decision 069). What else
// they ask, flags, remote config, surveys or logs, is refused: no app of the instance uses them.
const EVENT_PATHS = /^(?:e|batch|i\/v[01]\/e)\/?$/;

/** A fixed ingestion endpoint, never an arbitrary URL. Cookies and auth headers stay here. */
export async function proxyAnalytics(
  request: Request,
  host: string | undefined,
  read: typeof fetch = fetch,
) {
  const path = new URL(request.url).pathname.replace(/^\/(?:fr\/)?ingest\//, "");
  if (request.method !== "POST" || !host || !HOSTS.includes(host) || !EVENT_PATHS.test(path)) {
    return new Response(null, { status: 404 });
  }
  if (Number(request.headers.get("content-length")) > 1048576)
    return new Response(null, { status: 413 });
  const body = await request.arrayBuffer();
  if (body.byteLength > 1048576) return new Response(null, { status: 413 });
  try {
    const headers = new Headers();
    for (const key of ["content-type", "content-encoding"]) {
      const value = request.headers.get(key);
      if (value) headers.set(key, value);
    }
    const response = await read(`${host}/${path}`, {
      method: "POST",
      headers,
      body,
      // Workers supports manual/follow only. Never follow an upstream redirect.
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
    });
    if (response.status >= 300 && response.status < 400) return new Response(null, { status: 502 });
    return new Response(null, {
      status: response.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return new Response(null, { status: 502 });
  }
}
