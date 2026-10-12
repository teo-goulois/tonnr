// Decision 031, "Push". A browser gives the address of its subscription, and the worker sends a
// request there: an address is taken only when a push service of the browsers gave it.

// Where the browsers' push services answer: Chrome's and that of the browsers built on it,
// Firefox's, Safari's, Edge's. A name that begins with a dot stands for every host under it.
const PUSH_HOSTS = [
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  ".push.apple.com",
  ".notify.windows.com",
];

/**
 * Whether an address is one a push service of the browsers gives: `https`, at one of their
 * hosts, on the port `https` has, and with no name or password in it.
 */
export function isPushEndpoint(address: string): boolean {
  if (!URL.canParse(address)) return false;
  const url = new URL(address);
  if (url.protocol !== "https:" || url.port !== "" || url.username !== "" || url.password !== "") {
    return false;
  }
  return PUSH_HOSTS.some((known) =>
    known.startsWith(".") ? url.hostname.endsWith(known) : url.hostname === known,
  );
}
