// Decision 031, "Push". The keys of web push are points of the curve P-256: the public key of
// the instance's pair, which a browser subscribes with, and the public key of a browser, which
// a message is encrypted for.

/**
 * Whether a key, in base64url, is a point of the curve P-256 as its 65 bytes. A text of the
 * right length can be on no curve, and nothing can then be done with it.
 */
export async function isCurvePoint(key: string) {
  try {
    await crypto.subtle.importKey(
      "raw",
      Buffer.from(key, "base64url"),
      { name: "ECDH", namedCurve: "P-256" },
      false,
      [],
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * The public key an instance gives to browsers, from its settings. Undefined for an instance
 * that holds none, and sends no push. A key that is no point of the curve is refused here, as
 * the program starts: the API would give it to browsers, and none could subscribe with it.
 */
export async function pushKeyOf(settings: { VAPID_PUBLIC_KEY?: string | undefined }) {
  const key = settings.VAPID_PUBLIC_KEY;
  if (!key) return undefined;
  if (!(await isCurvePoint(key))) {
    throw new Error("VAPID_PUBLIC_KEY is not a point of the curve P-256");
  }
  return key;
}
