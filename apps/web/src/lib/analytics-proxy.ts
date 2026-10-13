const HOSTS = ["https://eu.i.posthog.com", "https://us.i.posthog.com"];

/** A fixed ingestion endpoint, never an arbitrary URL. Cookies and auth headers stay here. */
export async function proxyAnalytics(
  request: Request,
  host: string | undefined,
  read: typeof fetch = fetch,
) {
  const path = new URL(request.url).pathname.replace(/^\/(?:fr\/)?ingest\//, "");
  if (
    request.method !== "POST" ||
    !host ||
    !HOSTS.includes(host) ||
    !/^(?:e|i\/v[01]\/e)\/?$/.test(path)
  ) {
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
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    return new Response(null, {
      status: response.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return new Response(null, { status: 502 });
  }
}
