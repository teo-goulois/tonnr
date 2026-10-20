// What the tests of the updates stand on: a bucket kept in memory, and an answer read the way the
// client of expo-updates reads it. Nothing here asks Cloudflare.
import { createSign, generateKeyPairSync } from "node:crypto";

import { SIGNATURE_METADATA } from "./bucket.ts";

export type Kept = {
  body: Uint8Array;
  contentType?: string;
  cacheControl?: string;
  metadata: Record<string, string>;
};

/** A bucket in memory, with the binding the Worker reads it by. It counts what was asked of it. */
export function standInBucket() {
  const objects = new Map<string, Kept>();
  const calls: string[] = [];
  const binding = {
    async get(key: string) {
      calls.push(`get ${key}`);
      const kept = objects.get(key);
      if (!kept) return null;
      return {
        customMetadata: kept.metadata,
        httpMetadata: { contentType: kept.contentType, cacheControl: kept.cacheControl },
        arrayBuffer: async () => kept.body.slice().buffer,
      };
    },
  };
  const put = (key: string, body: Uint8Array | string, kept: Partial<Omit<Kept, "body">> = {}) =>
    objects.set(key, {
      body: typeof body === "string" ? new TextEncoder().encode(body) : body,
      metadata: {},
      ...kept,
    });
  return { objects, calls, binding: binding as unknown as R2Bucket, put };
}

/** A key pair made for a test, as the one that signs the updates. */
export function testKeys() {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return {
    privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicKey,
  };
}

/** Signs bytes with a key, in the header the client reads. */
export function testSignature(privateKey: string, body: Uint8Array | string, keyid = "main") {
  const signature = createSign("RSA-SHA256").update(body).sign(privateKey, "base64");
  return `sig="${signature}", keyid="${keyid}"`;
}

/** Keeps a signed object in the stand-in bucket, as a publication writes it. */
export function putSigned(
  bucket: ReturnType<typeof standInBucket>,
  key: string,
  body: string,
  privateKey: string,
) {
  bucket.put(key, body, {
    contentType: "application/json",
    metadata: { [SIGNATURE_METADATA]: testSignature(privateKey, body) },
  });
}

export type Part = { headers: Record<string, string>; body: Uint8Array };

const indexOf = (bytes: Uint8Array, needle: Uint8Array, from: number) => {
  outer: for (let at = from; at <= bytes.length - needle.length; at++) {
    for (let i = 0; i < needle.length; i++) if (bytes[at + i] !== needle[i]) continue outer;
    return at;
  }
  return -1;
};

/**
 * The parts of a multipart answer, read as `UpdatesMultipartStreamReader` reads them: the first
 * boundary may come first, every later one follows a line break, the last ends with `--` and a
 * line break, and a part's headers end at an empty line. It throws where the client would fail.
 */
export function readMultipart(bytes: Uint8Array, contentType: string): Part[] {
  const boundary = /boundary=([^;]+)/.exec(contentType)?.[1];
  if (!contentType.startsWith("multipart/") || !boundary) throw new Error("No boundary");
  const encode = (text: string) => new TextEncoder().encode(text);
  const first = encode(`--${boundary}\r\n`);
  const next = encode(`\r\n--${boundary}\r\n`);
  const close = encode(`\r\n--${boundary}--\r\n`);
  const empty = encode("\r\n\r\n");

  const start = indexOf(bytes, first, 0);
  if (start === -1) throw new Error("No first boundary");
  const parts: Part[] = [];
  let at = start + first.length;
  for (;;) {
    const nextAt = indexOf(bytes, next, at);
    const closeAt = indexOf(bytes, close, at);
    const end = nextAt !== -1 && (closeAt === -1 || nextAt < closeAt) ? nextAt : closeAt;
    if (end === -1) throw new Error("The answer does not end with its last boundary");
    const chunk = bytes.subarray(at, end);
    const split = indexOf(chunk, empty, 0);
    if (split === -1) throw new Error("A part has no headers");
    const headers = Object.fromEntries(
      new TextDecoder()
        .decode(chunk.subarray(0, split))
        .split("\r\n")
        .map((line) => [
          line.slice(0, line.indexOf(":")),
          line.slice(line.indexOf(":") + 1).trim(),
        ]),
    );
    parts.push({ headers, body: chunk.subarray(split + empty.length) });
    if (end === closeAt) return parts;
    at = end + next.length;
  }
}

/** What a part's `content-disposition` names it, as the client reads it. */
export const partName = (part: Part) =>
  /name="([^"]+)"/.exec(part.headers["content-disposition"] ?? "")?.[1];

/** The signature of a part, read from its `expo-signature` as the client reads it. */
export function signatureOf(part: Part): { sig: string; keyid: string } {
  const header = part.headers["expo-signature"] ?? "";
  const field = (name: string) => new RegExp(`${name}="([^"]*)"`).exec(header)?.[1];
  return { sig: field("sig") ?? "", keyid: field("keyid") ?? "root" };
}
