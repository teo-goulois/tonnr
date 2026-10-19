// Decision 031, "Push". A browser gives the address of its subscription, and the worker sends a
// request there: an address is taken only when a push service of the browsers gave it.

// Where the browsers' push services answer: Chrome's and that of the browsers built on it,
// Firefox's, Safari's, Edge's. A name that begins with a dot stands for every host under it.
// Safari's is the one host of Apple's: its others are APNs's own, which a browser's push has no
// business with (decision 072).
const PUSH_HOSTS = [
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  "web.push.apple.com",
  ".notify.windows.com",
];

/**
 * Whether an address is one a push service of the browsers gives: `https`, at one of their
 * hosts, on the port `https` has, with no name or password in it, and with no fragment. A
 * fragment is never sent to the service: two addresses that differ by theirs are one browser.
 */
export function isPushEndpoint(address: string): boolean {
  if (!URL.canParse(address) || address.includes("#")) return false;
  const url = new URL(address);
  if (url.protocol !== "https:" || url.port !== "" || url.username !== "" || url.password !== "") {
    return false;
  }
  return PUSH_HOSTS.some((known) =>
    known.startsWith(".") ? url.hostname.endsWith(known) : url.hostname === known,
  );
}
