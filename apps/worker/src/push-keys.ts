import { makeVapidKeys } from "@repo/push";

// `job push-keys`: makes the pair of keys an instance sends push with, and writes it nowhere.
// Decision 031, "Push". The pair is the operator's to put in the instance's settings and to
// keep: a browser subscribes to one public key, and is not reached with another pair.

/**
 * A new pair of keys, as the two lines of a settings file, and what to tell whoever asked for
 * it. `hasKeys` says that the instance holds a pair already.
 */
export function pushKeys(hasKeys: boolean) {
  const keys = makeVapidKeys();
  return {
    lines: [`VAPID_PUBLIC_KEY=${keys.publicKey}`, `VAPID_PRIVATE_KEY=${keys.privateKey}`],
    notes: [
      "A pair of keys to send push with. Set both where the API and the worker read their",
      "settings, and keep them: a browser that subscribed with one pair is not reached with another.",
      ...(hasKeys
        ? [
            "This instance holds a pair already. Replacing it ends every subscription made with it:",
            "each browser has to switch push on again.",
          ]
        : []),
    ],
  };
}
