/**
 * Whether the API refused a visitor because the instance is closed to them: decision 039. The
 * refusal says so in its `data`, which tells it from that of a session that ended.
 */
export function isClosedToVisitors(error: unknown) {
  if (typeof error !== "object" || error === null) return false;
  const { code, data } = error as { code?: unknown; data?: unknown };
  if (code !== "UNAUTHORIZED" || typeof data !== "object" || data === null) return false;
  return (data as { visitors?: unknown }).visitors === "closed";
}
