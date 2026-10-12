import {
  createDecipheriv,
  createECDH,
  createPublicKey,
  hkdfSync,
  randomBytes,
  verify,
} from "node:crypto";

import { type Device, type Push, createPusher } from "./index";
import { base64url, makeVapidKeys, pointOf } from "./keys";
import type { Answer } from "./request";

// What stands for a browser and for its push service in a test, here and in the programs that
// send push. No test sends a push: a function takes the place of the request.

const text = (words: string) => Buffer.from(`${words}\0`, "ascii");

/**
 * A browser's side of a push: the two keys it gives when it subscribes, and what it reads of a
 * push that was written for it. `open` throws on a body that was written for another browser,
 * or that was changed on the way.
 */
export function testReceiver() {
  const curve = createECDH("prime256v1");
  curve.generateKeys();
  const secret = randomBytes(16);
  const mine = curve.getPublicKey();
  return {
    keys: { p256dh: base64url(mine), auth: base64url(secret) },
    open(body: Uint8Array) {
      const whole = Buffer.from(body);
      const salt = whole.subarray(0, 16);
      const keyBytes = whole[20] ?? 0;
      const theirs = whole.subarray(21, 21 + keyBytes);
      const sealed = whole.subarray(21 + keyBytes);
      const keying = Buffer.from(
        hkdfSync(
          "sha256",
          curve.computeSecret(theirs),
          secret,
          Buffer.concat([text("WebPush: info"), mine, theirs]),
          32,
        ),
      );
      const key = Buffer.from(
        hkdfSync("sha256", keying, salt, text("Content-Encoding: aes128gcm"), 16),
      );
      const nonce = Buffer.from(
        hkdfSync("sha256", keying, salt, text("Content-Encoding: nonce"), 12),
      );
      const decipher = createDecipheriv("aes-128-gcm", key, nonce);
      decipher.setAuthTag(sealed.subarray(sealed.length - 16));
      const record = Buffer.concat([
        decipher.update(sealed.subarray(0, sealed.length - 16)),
        decipher.final(),
      ]);
      // What is said ends at the last byte that is not nothing, which marks the last record.
      let end = record.length - 1;
      while (end >= 0 && record[end] === 0) end -= 1;
      if (record[end] !== 2) throw new Error("The record does not end as the last one does");
      return record.subarray(0, end).toString("utf8");
    },
  };
}

/**
 * What the `Authorization` header of a push says: the public key it names, what its token
 * claims, and whether that key signed the token. Null when it is not such a header.
 */
export function readVapid(authorization: string | undefined) {
  const found = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(authorization ?? "");
  const [, header = "", claims = "", signature = "", publicKey = ""] = found ?? [];
  const point = pointOf(publicKey);
  if (!found || !point) return null;
  const key = createPublicKey({
    format: "jwk",
    key: {
      kty: "EC",
      crv: "P-256",
      x: base64url(point.subarray(1, 33)),
      y: base64url(point.subarray(33)),
    },
  });
  return {
    publicKey,
    header: JSON.parse(Buffer.from(header, "base64url").toString()) as Record<string, unknown>,
    claims: JSON.parse(Buffer.from(claims, "base64url").toString()) as Record<string, unknown>,
    isSigned: verify(
      "sha256",
      Buffer.from(`${header}.${claims}`),
      { key, dsaEncoding: "ieee-p1363" },
      Buffer.from(signature, "base64url"),
    ),
  };
}

/**
 * A pusher that asks no one: it signs and encrypts as the instance's does, and a push service
 * in memory takes what it sends. `device` makes a browser that subscribed, whose pushes `sent`
 * reads as that browser would. `answers` says what the push service answers at an address: a
 * status, or what a function gives, and 201 when it says nothing.
 */
export function testPusher() {
  const keys = makeVapidKeys();
  const receivers = new Map<string, ReturnType<typeof testReceiver>>();
  const answers = new Map<string, number | (() => Promise<Answer>)>();
  const asked: {
    endpoint: string;
    headers: Record<string, string>;
    body: Uint8Array;
    status?: number;
  }[] = [];
  const pusher = createPusher(
    { VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: keys.privateKey },
    "https://app.example.org",
    {
      post: async (address, headers, body) => {
        const answer = answers.get(address.href) ?? 201;
        const given = typeof answer === "number" ? { status: answer } : await answer();
        asked.push({
          endpoint: address.href,
          headers,
          body,
          ...("status" in given ? { status: given.status } : {}),
        });
        return given;
      },
    },
  );
  if (!pusher) throw new Error("No pusher was made");
  return {
    pusher,
    publicKey: keys.publicKey,
    answers,
    /** A browser that subscribed, at an address of a push service that no test asks. */
    device(
      endpoint = `https://fcm.googleapis.com/fcm/send/invented-${receivers.size + 1}`,
    ): Device {
      const receiver = testReceiver();
      receivers.set(endpoint, receiver);
      return { endpoint, ...receiver.keys };
    },
    /** Every request that was made, whatever it was answered. */
    asked: () => asked,
    /** The pushes that were taken, as the browsers they were for read them. */
    sent: () =>
      asked
        .filter(({ status }) => status !== undefined && status >= 200 && status < 300)
        .map(({ endpoint, headers, body }) => ({
          endpoint,
          keepSeconds: Number(headers.ttl),
          push: JSON.parse(receivers.get(endpoint)?.open(body) ?? "null") as Push,
        })),
  };
}
