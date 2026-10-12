import { type KeyObject, createECDH, createPrivateKey, generateKeyPairSync } from "node:crypto";

// The pair of keys an instance signs its pushes with: RFC 8292, "VAPID". A browser subscribes
// with the public one, and its push service then takes a push only from who holds the other.
// Both are kept as the browsers and the other programs that send push write them: the public
// key as a point of the curve P-256, 65 bytes, and the private one as its number, 32 bytes,
// each in base64url.

const BASE64URL = /^[A-Za-z0-9_-]+$/;
const POINT_BYTES = 65;
const NUMBER_BYTES = 32;

/** Bytes as a text in base64url, with no padding: how a browser writes its keys. */
export const base64url = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");

/** The bytes of a text in base64url. Null when it is not one, or not of that length. */
export function bytesOf(text: string, length: number) {
  if (!BASE64URL.test(text)) return null;
  const bytes = Buffer.from(text, "base64url");
  return bytes.length === length ? bytes : null;
}

/** A point of the curve as a browser gives it: 65 bytes, the first of which says it is whole. */
export function pointOf(text: string) {
  const point = bytesOf(text, POINT_BYTES);
  return point?.[0] === 4 ? point : null;
}

/** The keys of an instance, ready to sign with. */
export type VapidKeys = { publicKey: string; privateKey: KeyObject };

/** Makes a pair of keys, as an operator puts them in the instance's settings. */
export function makeVapidKeys() {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const { d, x, y } = privateKey.export({ format: "jwk" });
  if (!d || !x || !y) throw new Error("The pair of keys could not be made");
  const point = Buffer.concat([
    Buffer.from([4]),
    Buffer.from(x, "base64url"),
    Buffer.from(y, "base64url"),
  ]);
  return { publicKey: base64url(point), privateKey: d };
}

/**
 * Reads an instance's pair of keys. It throws on what is not a pair: a key that is not one, or
 * a public key that is not the private one's. A push signed with such a pair is refused by
 * every push service, and a browser that subscribed with that public key is never reached.
 */
export function readVapidKeys(publicKey: string, privateKey: string): VapidKeys {
  const point = pointOf(publicKey);
  if (!point) throw new Error("VAPID_PUBLIC_KEY is not a public key: 65 bytes in base64url");
  const number = bytesOf(privateKey, NUMBER_BYTES);
  if (!number) throw new Error("VAPID_PRIVATE_KEY is not a private key: 32 bytes in base64url");
  const curve = createECDH("prime256v1");
  try {
    curve.setPrivateKey(number);
  } catch {
    // The library's words are left out: they are about the key.
    throw new Error("VAPID_PRIVATE_KEY is not a private key of the curve P-256");
  }
  if (Buffer.compare(curve.getPublicKey(), point) !== 0) {
    throw new Error("VAPID_PUBLIC_KEY is not the public key of VAPID_PRIVATE_KEY");
  }
  return {
    publicKey,
    privateKey: createPrivateKey({
      format: "jwk",
      key: {
        kty: "EC",
        crv: "P-256",
        d: privateKey,
        x: base64url(point.subarray(1, 33)),
        y: base64url(point.subarray(33)),
      },
    }),
  };
}
