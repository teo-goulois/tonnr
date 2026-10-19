import {
  type KeyObject,
  createDecipheriv,
  createECDH,
  createPublicKey,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
  randomUUID,
  verify,
} from "node:crypto";

import { type StreamAnswer, APNS_HOSTS, createApnsPusher } from "./apns";
import { FCM_SCOPE, GOOGLE_TOKEN_ADDRESS, createFcmPusher, fcmAddressOf } from "./fcm";
import { type AppDevice, type Device, type Push, createPusher } from "./index";
import { base64url, makeVapidKeys, pointOf } from "./keys";
import type { Answer } from "./request";

// What stands for a browser and for its push service in a test, here and in the programs that
// send push, and for the app on a phone with Apple's and Google's services (decision 072). No
// test sends a push: a function takes the place of the request.

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

/** What the app on a phone reads of a push: all of it but the language of its stand-in line. */
export type AppPush = Omit<Push, "locale">;

/**
 * What a JSON Web Token says, and whether the key given signed it: ES256 for Apple's, with the
 * two numbers of its signature one after the other, RS256 for Google's. Null when it is not
 * such a token.
 */
export function readToken(token: string | null | undefined, key: KeyObject) {
  const found = /^([\w-]+)\.([\w-]+)\.([\w-]+)$/.exec(token ?? "");
  if (!found) return null;
  const [, header = "", claims = "", signature = ""] = found;
  return {
    header: JSON.parse(Buffer.from(header, "base64url").toString()) as Record<string, unknown>,
    claims: JSON.parse(Buffer.from(claims, "base64url").toString()) as Record<string, unknown>,
    isSigned: verify(
      "sha256",
      Buffer.from(`${header}.${claims}`),
      key.asymmetricKeyType === "ec" ? { key, dsaEncoding: "ieee-p1363" } : key,
      Buffer.from(signature, "base64url"),
    ),
  };
}

// What Apple answers for a request it does not take: a status, and its reason in JSON.
const apnsRefusal = (status: number, reason: string): StreamAnswer => ({
  status,
  body: JSON.stringify({ reason }),
});

/**
 * What stands for APNs: a pusher to the app on an iPhone that asks no one, with a key of an
 * Apple team made for the test, and Apple's two hosts in memory. As Apple does, they take a push
 * only under a token the team's key signed, for the app's topic, as an alert, no larger than
 * Apple takes, and at the host of the environment its phone's build said, and otherwise answer
 * with the status and the reason Apple gives. `device` makes an iPhone whose app registered,
 * whose pushes `sent` reads as its extension would. `answers` says what Apple answers for a
 * token: a status and a reason, or what a function gives, and 200 when it says nothing.
 */
export function testApns(topic = "org.example.app") {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const settings = {
    APPLE_TEAM_ID: "TEAM123456",
    APNS_KEY_ID: "KEY1234567",
    // As the `.p8` file Apple gives is written.
    APNS_PRIVATE_KEY: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
    APNS_TOPIC: topic,
  };
  type Payload = {
    aps?: { alert?: { title?: string }; "mutable-content"?: number };
    encrypted?: string;
  };
  const phones = new Map<
    string,
    { receiver: ReturnType<typeof testReceiver>; environment: "development" | "production" }
  >();
  const answers = new Map<
    string,
    { status: number; reason?: string } | (() => Promise<StreamAnswer>)
  >();
  const asked: {
    host: string;
    token: string;
    headers: Record<string, string>;
    payload: Payload;
    status?: number;
    reason?: string;
  }[] = [];

  // What Apple answers a request, in the order it checks what it is given.
  const answerTo = async (host: string, headers: Record<string, string>, body: Uint8Array) => {
    const token = (headers[":path"] ?? "").replace(/^\/3\/device\//, "");
    const provider = readToken(headers.authorization?.replace(/^bearer /, ""), publicKey);
    if (
      !provider?.isSigned ||
      provider.header.alg !== "ES256" ||
      provider.header.kid !== settings.APNS_KEY_ID ||
      provider.claims.iss !== settings.APPLE_TEAM_ID
    ) {
      return apnsRefusal(403, "InvalidProviderToken");
    }
    if (headers["apns-topic"] !== topic) return apnsRefusal(400, "DeviceTokenNotForTopic");
    if (headers["apns-push-type"] !== "alert") return apnsRefusal(400, "InvalidPushType");
    if (body.length > 4096) return apnsRefusal(413, "PayloadTooLarge");
    const phone = phones.get(token);
    // A token is known at the host of its build's environment, and at no other.
    if (!phone || host !== APNS_HOSTS[phone.environment]) {
      return apnsRefusal(400, "BadDeviceToken");
    }
    const told = answers.get(token);
    if (told === undefined) return { status: 200, body: "" };
    return typeof told === "function" ? told() : apnsRefusal(told.status, told.reason ?? "");
  };

  const pusher = createApnsPusher(settings, {
    stream: async (host, headers, body) => {
      const given = await answerTo(host, headers, body);
      let reason: string | undefined;
      if ("status" in given && given.body !== "") {
        reason = (JSON.parse(given.body) as { reason?: string }).reason;
      }
      asked.push({
        host,
        token: (headers[":path"] ?? "").replace(/^\/3\/device\//, ""),
        headers,
        payload: JSON.parse(Buffer.from(body).toString()) as Payload,
        ...("status" in given ? { status: given.status, reason } : {}),
      });
      return given;
    },
  });
  if (!pusher) throw new Error("No pusher was made");
  return {
    pusher,
    settings,
    publicKey,
    answers,
    /** An iPhone of the instance's app that registered, from a build of an environment. */
    device(environment: "development" | "production" = "production"): AppDevice {
      const token = Buffer.from(randomBytes(32)).toString("hex");
      const receiver = testReceiver();
      phones.set(token, { receiver, environment });
      return { token, appId: topic, environment, ...receiver.keys };
    },
    /** Every request that was made, whatever it was answered. */
    asked: () => asked,
    /** The pushes Apple took, as the app's extension reads them, with what Apple read. */
    sent: () =>
      asked
        .filter(({ status }) => status === 200)
        .map(({ host, token, headers, payload }) => ({
          host,
          token,
          standIn: payload.aps?.alert?.title,
          mutable: payload.aps?.["mutable-content"],
          priority: Number(headers["apns-priority"]),
          expiration: Number(headers["apns-expiration"]),
          collapseId: headers["apns-collapse-id"] ?? null,
          push: JSON.parse(
            phones.get(token)?.receiver.open(Buffer.from(payload.encrypted ?? "", "base64url")) ??
              "null",
          ) as AppPush,
        })),
  };
}

// The keys of the service account the tests' instances share: an RSA pair takes a while to make,
// and is made once.
let serviceAccount: { privateKey: KeyObject; publicKey: KeyObject } | undefined;
const serviceAccountKeys = () =>
  (serviceAccount ??= generateKeyPairSync("rsa", { modulusLength: 2048 }));

// How Google says that it does not take a push: the status, and FCM's own code in its details.
const fcmRefusal = (status: number, code: string): Answer => ({
  status,
  body: JSON.stringify({
    error: {
      code: status,
      message: "Invented for a test.",
      status: code === "UNREGISTERED" ? "NOT_FOUND" : code,
      details: [
        { "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError", errorCode: code },
      ],
    },
  }),
});

/**
 * What stands for FCM: a pusher to the app on an Android phone that asks no one, with a service
 * account made for the test, and Google's two addresses in memory. As Google does, they give an
 * access token for an hour for a token the account signed, for the scope of messaging, and take
 * a push only with an access token they gave, for a phone that registered. `device` makes an
 * Android phone whose app registered, whose pushes `sent` reads as its service would. `answers`
 * says what FCM answers for a token: a status and FCM's code, or what a function gives, and 200
 * when it says nothing. `exchanges` lists the access tokens that were asked for, and `tokens`
 * says how long one lasts, or what Google answers when one is asked for.
 */
export function testFcm(project = "example-project") {
  const { privateKey, publicKey } = serviceAccountKeys();
  const settings = {
    FCM_PROJECT_ID: project,
    FCM_CLIENT_EMAIL: `pusher@${project}.iam.gserviceaccount.com`,
    // As the file of a service account writes it, with its line breaks as `\n`.
    FCM_PRIVATE_KEY: privateKey
      .export({ format: "pem", type: "pkcs8" })
      .toString()
      .replaceAll("\n", "\\n"),
  };
  type Message = {
    token?: string;
    data?: Record<string, string>;
    notification?: unknown;
    android?: { priority?: string; ttl?: string; collapse_key?: string };
  };
  const phones = new Map<string, ReturnType<typeof testReceiver>>();
  const issued = new Set<string>();
  const exchanges: { claims: Record<string, unknown>; isSigned: boolean }[] = [];
  const answers = new Map<string, { status: number; code?: string } | (() => Promise<Answer>)>();
  const tokens: { lifetime: number; answer?: () => Promise<Answer> } = { lifetime: 3599 };
  const asked: {
    token: string;
    headers: Record<string, string>;
    message: Message;
    status?: number;
  }[] = [];

  // An access token, for a token the service account signed.
  const exchange = (body: Uint8Array): Answer => {
    const form = new URLSearchParams(Buffer.from(body).toString());
    const read = readToken(form.get("assertion"), publicKey);
    exchanges.push({ claims: read?.claims ?? {}, isSigned: read?.isSigned ?? false });
    if (
      form.get("grant_type") !== "urn:ietf:params:oauth:grant-type:jwt-bearer" ||
      !read?.isSigned ||
      read.header.alg !== "RS256" ||
      read.claims.iss !== settings.FCM_CLIENT_EMAIL ||
      read.claims.scope !== FCM_SCOPE ||
      read.claims.aud !== GOOGLE_TOKEN_ADDRESS
    ) {
      return { status: 400, body: JSON.stringify({ error: "invalid_grant" }) };
    }
    const token = `ya29.invented-${randomUUID()}`;
    issued.add(token);
    return {
      status: 200,
      body: JSON.stringify({
        access_token: token,
        expires_in: tokens.lifetime,
        token_type: "Bearer",
      }),
    };
  };

  // What FCM answers a push.
  const answerTo = async (headers: Record<string, string>, message: Message): Promise<Answer> => {
    const token = message.token ?? "";
    if (!issued.has(headers.authorization?.replace(/^Bearer /, "") ?? "")) {
      return fcmRefusal(401, "UNAUTHENTICATED");
    }
    if (!phones.has(token)) return fcmRefusal(404, "UNREGISTERED");
    if (JSON.stringify(message.data ?? {}).length > 4096)
      return fcmRefusal(400, "INVALID_ARGUMENT");
    const told = answers.get(token);
    if (told === undefined) {
      return { status: 200, body: JSON.stringify({ name: `projects/${project}/messages/1` }) };
    }
    return typeof told === "function" ? told() : fcmRefusal(told.status, told.code ?? "INTERNAL");
  };

  const pusher = createFcmPusher(settings, {
    post: async (address, headers, body) => {
      if (address.href === GOOGLE_TOKEN_ADDRESS) {
        return tokens.answer ? tokens.answer() : exchange(body);
      }
      if (address.href !== fcmAddressOf(project)) return { status: 404 };
      const { message } = JSON.parse(Buffer.from(body).toString()) as { message: Message };
      const given = await answerTo(headers, message);
      asked.push({
        token: message.token ?? "",
        headers,
        message,
        ...("status" in given ? { status: given.status } : {}),
      });
      return given;
    },
  });
  if (!pusher) throw new Error("No pusher was made");
  return {
    pusher,
    settings,
    answers,
    tokens,
    exchanges: () => exchanges,
    /** Forgets the access tokens Google gave, as Google does once one is revoked. */
    revoke: () => issued.clear(),
    /** An Android phone of the instance's app that registered. */
    device(): AppDevice {
      const random = (bytes: number) => Buffer.from(randomBytes(bytes)).toString("base64url");
      const token = `${random(8)}:APA91b${random(96)}`;
      const receiver = testReceiver();
      phones.set(token, receiver);
      return { token, appId: "org.example.app", environment: null, ...receiver.keys };
    },
    /** Every push that was asked, whatever it was answered. */
    asked: () => asked,
    /** The pushes FCM took, as the app's service reads them, with what Google read. */
    sent: () =>
      asked
        .filter(({ status }) => status === 200)
        .map(({ token, message }) => ({
          token,
          priority: message.android?.priority,
          ttl: message.android?.ttl,
          // What Google could read besides: the names of the data's fields, and whether it is
          // anything the system shows by itself.
          fields: Object.keys(message.data ?? {}),
          shown: message.notification !== undefined,
          collapseKey: message.android?.collapse_key ?? null,
          push: JSON.parse(
            phones.get(token)?.open(Buffer.from(message.data?.encrypted ?? "", "base64url")) ??
              "null",
          ) as AppPush,
        })),
  };
}
