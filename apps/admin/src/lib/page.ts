/**
 * A page of this app, from what an address says to go back to. The address is written by
 * whoever made the link: only a path of this app is taken, and the first page stands for
 * anything else, a page of another site among them.
 */
export function pageOf(asked: unknown) {
  if (typeof asked !== "string" || asked.length > 2000) return "/";
  // One slash, then no second one and no backslash: `//host` and `/\\host` name another site.
  if (!/^\/(?![/\\])/.test(asked)) return "/";
  // Nothing a browser would read as the start of a line or of another address.
  if (/[\u0000-\u001f\u007f]/.test(asked)) return "/";
  // Back to the sign-in would go round.
  if (asked === "/login" || asked.startsWith("/login?") || asked.startsWith("/login/")) return "/";
  return asked;
}
