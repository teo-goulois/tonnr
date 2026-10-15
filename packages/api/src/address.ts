/**
 * The address a request comes from, as the proxy in front of the API says it: `X-Real-IP`
 * when the proxy sets it, else the last address of `X-Forwarded-For`, which the proxy added,
 * else the address of the connection itself. A caller can write these headers too: the proxy
 * takes them off, or the instance's settings say so. `docs/self-hosting.md` says what a proxy
 * must do. It names a visitor, whom nothing else names, for the limits of decision 053.
 */
export function clientAddressOf(headers: Headers, connection: string | null): string | null {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = headers
    .get("x-forwarded-for")
    ?.split(",")
    .map((address) => address.trim())
    .filter((address) => address !== "")
    .at(-1);
  return forwarded ?? connection;
}
