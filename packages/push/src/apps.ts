import { createHmac, createPrivateKey, type KeyObject, sign } from "node:crypto";

import type { Locale } from "@repo/mail/verification";

import { encryptPush } from "./encrypt";
import type { AppDevice, Push } from "./index";
import { base64url, bytesOf, pointOf } from "./keys";

// Decision 072: what a push to the app on a phone holds is encrypted for that phone as it is for
// a browser, by RFC 8291, for the two keys the app gave. Apple and Google read the token, when
// the push left, until when it is worth keeping, how urgent it is and its size, and Apple the
// line that stands in for it. What follows is what the two ways out to the apps share.

/** The most a push to an app holds, in bytes: Apple's whole payload, Google's data alike. */
export const APP_PAYLOAD_BYTES = 4096;
/** A push service keeps a push four weeks at most: Apple's and Google's, as a browser's. */
export const KEPT_AT_MOST_SECONDS = 28 * 24 * 60 * 60;

/**
 * The line Apple shows in the place of a push that the app could not open in time: the one the
 * web app's service worker shows for a push it cannot read, in the account's language. It is
 * the same for an alert and for a report, so that Apple cannot tell the two apart.
 */
export const STAND_IN: Record<Locale, string> = {
  en: "One of your alerts has news",
  fr: "Une de tes alertes a du nouveau",
  es: "Una de tus alertas tiene novedades",
  pt: "Um dos teus alertas tem novidades",
};

/** How long a push is kept for a phone that is off, in whole seconds a service takes. */
export const keptFor = (keepSeconds: number) =>
  Math.min(Math.max(0, Math.floor(keepSeconds)), KEPT_AT_MOST_SECONDS);

// What the app reads of a push: all of it but the language of the line that stands in for it,
// with its picture or without.
const saidToApp = (push: Push, withImage: boolean) => {
  const { locale: _locale, image, ...words } = push;
  return Buffer.from(JSON.stringify(withImage && image ? { ...words, image } : words));
};

/**
 * The payload of a push to an app: what it says encrypted for the phone, in base64url as
 * `sealed`, which `wrap` writes into what its service takes. A picture's address goes with the words while the
 * whole fits, and the words go alone otherwise. A refusal says why, when the phone's keys are
 * not keys or even the words do not fit.
 */
export function payloadFor(
  device: AppDevice,
  push: Push,
  wrap: (sealed: string) => Uint8Array,
): { payload: Uint8Array; sealed: string } | { refused: string } {
  if (!pointOf(device.p256dh) || !bytesOf(device.auth, 16)) {
    return { refused: "keys that are not a phone's" };
  }
  for (const withImage of push.image ? [true, false] : [false]) {
    // Null when it is too long for one record, which is longer than a payload.
    const sealed = encryptPush(saidToApp(push, withImage), device);
    if (!sealed) continue;
    const written = base64url(sealed);
    const payload = wrap(written);
    if (payload.length <= APP_PAYLOAD_BYTES) return { payload, sealed: written };
  }
  return { refused: "too long for one push" };
}

/**
 * What a push to an iPhone is collapsed under: its tag, hashed with the phone's own secret. A
 * newer word on the same thing then takes the older one's place on the phone, and Apple reads
 * nothing of what it is: the tag of a report's push names its break, which anyone can read in
 * the catalogue. Null for a push with no tag, which takes no other's place.
 */
export function collapseIdOf(tag: string, auth: string) {
  const secret = bytesOf(auth, 16);
  if (!secret || tag === "") return null;
  return createHmac("sha256", secret).update(tag).digest("base64url").slice(0, 22);
}

/**
 * A private key as a settings file holds it: the text of a PEM file, whose line breaks may be
 * written as `\n`, as Google's file of a service account writes them. It throws, naming the
 * variable and nothing of the key, on what is not a key of the kind asked for.
 */
export function privateKeyOf(name: string, text: string, kind: "ec" | "rsa"): KeyObject {
  let key: KeyObject;
  try {
    key = createPrivateKey({ key: text.replaceAll("\\n", "\n"), format: "pem" });
  } catch {
    // The library's words are left out: they are about the key.
    throw new Error(`${name} is not a private key in PEM`);
  }
  if (key.asymmetricKeyType !== kind) {
    throw new Error(`${name} is not ${kind === "ec" ? "an EC" : "an RSA"} private key`);
  }
  if (kind === "ec" && key.asymmetricKeyDetails?.namedCurve !== "prime256v1") {
    throw new Error(`${name} is not a private key of the curve P-256`);
  }
  return key;
}

/**
 * A JSON Web Token signed with a private key: ES256 for Apple's, whose signature holds its two
 * numbers one after the other, and RS256 for Google's.
 */
export function signedToken(
  header: Record<string, string>,
  claims: Record<string, string | number>,
  key: KeyObject,
) {
  const part = (value: object) => base64url(Buffer.from(JSON.stringify(value)));
  const signed = `${part(header)}.${part(claims)}`;
  const signature = sign(
    "sha256",
    Buffer.from(signed),
    key.asymmetricKeyType === "ec" ? { key, dsaEncoding: "ieee-p1363" } : key,
  );
  return `${signed}.${base64url(signature)}`;
}
