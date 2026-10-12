import { createCipheriv, createECDH, hkdfSync, randomBytes } from "node:crypto";

import { bytesOf, pointOf } from "./keys";

// What a push holds is encrypted for the browser it goes to: RFC 8291, with the content coding
// "aes128gcm" of RFC 8188. The push service reads the address, and nothing of the alert.

// One record holds the whole push, as the standard asks. A push service need not take a body
// longer than this.
const RECORD_BYTES = 4096;
// The header of the coding: a salt, the size of a record, and the sender's public key.
const HEADER_BYTES = 16 + 4 + 1 + 65;
const TAG_BYTES = 16;
/** The most a push can say, in bytes: what a record holds beside its header, its end and its tag. */
export const PUSH_BYTES = RECORD_BYTES - HEADER_BYTES - 1 - TAG_BYTES;

/** What a browser gives to be written to: its public key and its secret, in base64url. */
export type Receiver = { p256dh: string; auth: string };

const text = (words: string) => Buffer.from(`${words}\0`, "ascii");

/**
 * Encrypts what a push says for one browser, and gives the body of the request. Null when the
 * browser's keys are not keys, or when it is too long for one push. `chosen` stands for what is
 * drawn at random, in a test that compares with the standard's own example.
 */
export function encryptPush(
  said: Uint8Array,
  receiver: Receiver,
  chosen?: { salt: Uint8Array; privateKey: Uint8Array },
) {
  const theirs = pointOf(receiver.p256dh);
  const secret = bytesOf(receiver.auth, 16);
  if (!theirs || !secret || said.length > PUSH_BYTES) return null;

  // A pair of keys for this push alone: what it shares with the browser's is the secret.
  const ours = createECDH("prime256v1");
  if (chosen) ours.setPrivateKey(chosen.privateKey);
  else ours.generateKeys();
  const mine = ours.getPublicKey();
  let shared: Uint8Array;
  try {
    shared = ours.computeSecret(theirs);
  } catch {
    // A point that is not on the curve: not a key a browser gave.
    return null;
  }
  const salt = chosen?.salt ?? randomBytes(16);
  const keying = Buffer.from(
    hkdfSync("sha256", shared, secret, Buffer.concat([text("WebPush: info"), theirs, mine]), 32),
  );
  const key = Buffer.from(
    hkdfSync("sha256", keying, salt, text("Content-Encoding: aes128gcm"), 16),
  );
  const nonce = Buffer.from(hkdfSync("sha256", keying, salt, text("Content-Encoding: nonce"), 12));

  const cipher = createCipheriv("aes-128-gcm", key, nonce);
  // The byte after what is said marks the end of the last record, which is the only one.
  const sealed = Buffer.concat([
    cipher.update(said),
    cipher.update(Buffer.from([2])),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(RECORD_BYTES);
  return Buffer.concat([salt, size, Buffer.from([mine.length]), mine, sealed]);
}
