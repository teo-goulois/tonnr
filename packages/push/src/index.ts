import { isPushEndpoint } from "./endpoints";
import { PUSH_BYTES, encryptPush } from "./encrypt";
import { readVapidKeys } from "./keys";
import { type Post, post } from "./request";
import { vapidHeader } from "./vapid";

export { isPushEndpoint } from "./endpoints";
export { makeVapidKeys } from "./keys";

// How the instance sends a push to a browser: decision 031, "Push". This knows the standards a
// push is written by, RFC 8030, 8291 and 8292, and nothing of an alert. They are built on
// `node:crypto` and `node:https` rather than on a library: they ask for one exchange of keys,
// one derivation, one cipher and one signature, each of which Node has and the standard gives
// an example to check against, while a library would bring its own request, which is the part
// that has to be ours. Nothing here is logged of a push but how it failed.

/** What an instance sets to send push: its pair of keys. Without them it sends none. */
export type PushSettings = {
  VAPID_PUBLIC_KEY?: string | undefined;
  VAPID_PRIVATE_KEY?: string | undefined;
};

/**
 * What a push says, as the web app's service worker reads it: it shows `title` and `body`,
 * under `tag` so that a newer word on the same thing takes the older one's place, and opens
 * `url` when the notification is pressed. `image` is a picture a browser may show beside the
 * words, which Chrome does on Android and on a computer, and Safari and Firefox do not: a
 * report's push gives one (decision 068).
 */
export type Push = { title: string; body: string; url: string; tag: string; image?: string };

/** A browser that subscribed: the address its push service gave it, and its two keys. */
export type Device = { endpoint: string; p256dh: string; auth: string };

/**
 * What became of a push to one browser. `taken`: its push service took it, which is not yet a
 * notification on a screen. `gone`: the push service says that the subscription is no more.
 * `refused`: it did not leave, since it was not sent or the push service answered that it does
 * not take it. `failed`: nobody knows, since the push service did not answer, or not in time,
 * or answered that it failed itself: it may have taken the push all the same.
 */
export type Outcome = "taken" | "gone" | "refused" | "failed";

export type Pusher = {
  /**
   * Sends a push to one browser, once, and answers within ten seconds. `keepSeconds` is how
   * long the push service keeps it for a browser that is off. What was sent when it gives up
   * may still arrive, and nothing more is sent after the answer: the connection is closed.
   */
  send: (device: Device, push: Push, keepSeconds: number) => Promise<Outcome>;
};

// How long a push may take to leave: what holds an account's settings waits for it.
const SEND_MS = 10_000;
// A push service keeps a push for four weeks at most.
const KEPT_AT_MOST_SECONDS = 28 * 24 * 60 * 60;
// How long the token that names the instance to a push service is used before another is
// signed. A token is good for half a day, and one of the push services asks that a new one be
// made no more than once an hour.
const TOKEN_KEPT_MS = 60 * 60 * 1000;

/**
 * The pusher of an instance, from its keys. Null without keys: the instance then sends no push.
 * It throws on settings that cannot be right, so that the worker does not start with them.
 * `subject` is the address that names the instance to a push service: the web app's. Without
 * it there is no pusher either, once the keys are known to be a pair.
 *
 * A push goes only to an address that a push service of the browsers gave, unless a test names
 * another with `allows`. A test may also give its own `post`, which asks no one, and less time
 * for a push to leave.
 */
export function createPusher(
  settings: PushSettings,
  subject: string | undefined,
  options: { allows?: (address: string) => boolean; post?: Post; sendMs?: number } = {},
): Pusher | null {
  const { VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey } = settings;
  if (!publicKey && !privateKey) return null;
  if (!publicKey || !privateKey) {
    throw new Error("Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY, or neither");
  }
  const keys = readVapidKeys(publicKey, privateKey);
  if (subject === undefined) return null;
  if (!URL.canParse(subject)) throw new Error("A push names its instance by an address");
  const allows = options.allows ?? isPushEndpoint;
  const give = options.post ?? post;
  const sendMs = options.sendMs ?? SEND_MS;

  // The token for each push service, by the beginning of its address, and when it was signed.
  const tokens = new Map<string, { header: string; at: number }>();
  const signedFor = (audience: string) => {
    const now = Date.now();
    const kept = tokens.get(audience);
    if (kept && now >= kept.at && now - kept.at < TOKEN_KEPT_MS) return kept.header;
    // Those that are too old to be used are let go, so that the list is as long as the push
    // services of an hour are many.
    for (const [name, token] of tokens) {
      if (now < token.at || now - token.at >= TOKEN_KEPT_MS) tokens.delete(name);
    }
    const header = vapidHeader(keys, audience, subject, new Date(now));
    tokens.set(audience, { header, at: now });
    return header;
  };

  // What is kept of a push that was not taken: the kind of failure, and never the address,
  // which lets whoever holds it send to that browser.
  const not = (outcome: "refused" | "failed", kind: string) => {
    console.error(`push: not taken (${kind})`);
    return outcome;
  };

  return {
    send: async (device, push, keepSeconds) => {
      try {
        // Checked again as it leaves: an address is where a request goes.
        if (!allows(device.endpoint)) return not("refused", "an address no push service gave");
        // A push service is told a number of seconds, and takes nothing else.
        if (!Number.isFinite(keepSeconds)) return not("refused", "no time to keep it for");
        const words = { title: push.title, body: push.body, url: push.url, tag: push.tag };
        // A picture's address goes with the words while they fit together: the words alone
        // otherwise, which a browser shows the same.
        const withImage = push.image
          ? Buffer.from(JSON.stringify({ ...words, image: push.image }))
          : null;
        const said =
          withImage && withImage.length <= PUSH_BYTES
            ? withImage
            : Buffer.from(JSON.stringify(words));
        if (said.length > PUSH_BYTES) return not("refused", "too long for one push");
        const body = encryptPush(said, device);
        if (!body) return not("refused", "keys that are not a browser's");
        const address = new URL(device.endpoint);
        const answer = await give(
          address,
          {
            authorization: signedFor(address.origin),
            "content-encoding": "aes128gcm",
            "content-type": "application/octet-stream",
            ttl: String(Math.min(Math.max(0, Math.floor(keepSeconds)), KEPT_AT_MOST_SECONDS)),
          },
          body,
          AbortSignal.timeout(sendMs),
        );
        if ("failure" in answer) {
          return not(
            "failed",
            answer.failure === "given up" ? "no answer in time" : answer.failure,
          );
        }
        const { status } = answer;
        if (status >= 200 && status < 300) return "taken";
        // The two answers by which a push service says that a subscription is no more.
        if (status === 404 || status === 410) return "gone";
        // A push service that fails does not say what it did with the push before.
        return not(status >= 500 ? "failed" : "refused", `status ${status}`);
      } catch (error) {
        return not("failed", error instanceof Error ? error.name : "unknown");
      }
    },
  };
}
