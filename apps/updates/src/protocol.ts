// The Expo Updates protocol, version 1, as the Worker of updates answers it: what an app asks in
// its headers, which part of a publication it gets, and the multipart answer, in the form the
// client of expo-updates 58 reads (`FileDownloader` in its iOS and Android code). Decision 075.
import {
  type Platform,
  isPlatform,
  isRuntime,
  isUpdateId,
  latestKey,
  readLatest,
  signedKey,
} from "./bucket.ts";

/** Said on every answer to an app: the protocol, the structured fields, and no cache. */
export const ANSWER_HEADERS = {
  "expo-protocol-version": "1",
  "expo-sfv-version": "0",
  "cache-control": "private, max-age=0",
} as const;

/** What an app asks: its platform and runtime, and the update it runs and the one it shipped with. */
export type Asked = {
  platform: Platform;
  runtime: string;
  currentUpdateId: string | null;
  embeddedUpdateId: string | null;
};

export type Refused = { status: 400 | 406; reason: string };

const updateIdOf = (value: string | null) => {
  const id = value?.trim().toLowerCase() ?? null;
  return isUpdateId(id) ? id : null;
};

/** Reads what an app asks from its headers, or why it is refused. */
export function readAsked(headers: Headers): Asked | Refused {
  const platform = headers.get("expo-platform");
  if (!isPlatform(platform)) return { status: 400, reason: "Unknown platform" };
  // An app of protocol 0 sends no version: it is not one of ours.
  if (headers.get("expo-protocol-version")?.trim() !== "1") {
    return { status: 406, reason: "Only protocol 1 is served" };
  }
  const runtime = headers.get("expo-runtime-version")?.trim();
  if (!isRuntime(runtime)) return { status: 400, reason: "Unknown runtime" };
  return {
    platform,
    runtime,
    currentUpdateId: updateIdOf(headers.get("expo-current-update-id")),
    embeddedUpdateId: updateIdOf(headers.get("expo-embedded-update-id")),
  };
}

/** Bytes as they were signed, and the `expo-signature` they are served with. */
export type Signed = { body: Uint8Array; signature: string };

/** What the Worker reads: the bucket, or what a test stands for it. */
export interface Store {
  get(key: string): Promise<{ body: Uint8Array; signature: string | null } | null>;
}

export type Answer =
  | { part: "manifest" | "directive"; signed: Signed }
  // Nothing new: a 204, which protocol 1 allows, which needs no signature and which the client
  // reads as it reads the directive `noUpdateAvailable`. A directive signed once and served to
  // every runtime would carry one key's signature to binaries that may check another's, those
  // of an older certificate, which would refuse it at each start.
  | { part: null };

const signedOf = (object: Awaited<ReturnType<Store["get"]>>): Signed | null =>
  object?.signature ? { body: object.body, signature: object.signature } : null;

const NOTHING_NEW: Answer = { part: null };

/**
 * Which part of the latest publication of its runtime an app gets: the manifest of an update
 * it does not run, the directive that sends it back to its binary's JavaScript, or nothing new.
 */
export async function answerOf(asked: Asked, store: Store): Promise<Answer> {
  const pointer = await store.get(latestKey(asked.platform, asked.runtime));
  const latest = pointer ? readLatest(new TextDecoder().decode(pointer.body)) : null;
  if (!latest) return NOTHING_NEW;
  if (latest.kind === "update" && asked.currentUpdateId === latest.id) return NOTHING_NEW;
  // An app that runs its binary's JavaScript already has nothing to go back to.
  if (
    latest.kind === "rollBackToEmbedded" &&
    asked.currentUpdateId !== null &&
    asked.currentUpdateId === asked.embeddedUpdateId
  ) {
    return NOTHING_NEW;
  }

  const signed = signedOf(await store.get(signedKey(asked.platform, asked.runtime, latest.id)));
  // The publication writes the signed object before it points at it: one that is missing is a
  // fault, which the app reads as no answer and starts on what it has.
  if (!signed) throw new Error("The latest publication has no signed object");
  return { part: latest.kind === "update" ? "manifest" : "directive", signed };
}

const CRLF = "\r\n";

/**
 * The multipart answer of one part. The client finds the first boundary with or without a line
 * before it, reads a part's headers up to an empty line, and needs a line break after the last
 * boundary.
 */
export function multipartOf(
  part: "manifest" | "directive",
  signed: Signed,
  boundary: string,
): Uint8Array {
  const encoder = new TextEncoder();
  const head = encoder.encode(
    [
      `--${boundary}`,
      `content-disposition: form-data; name="${part}"`,
      "content-type: application/json; charset=utf-8",
      `expo-signature: ${signed.signature}`,
      "",
      "",
    ].join(CRLF),
  );
  const tail = encoder.encode(`${CRLF}--${boundary}--${CRLF}`);
  const bytes = new Uint8Array(head.length + signed.body.length + tail.length);
  bytes.set(head, 0);
  bytes.set(signed.body, head.length);
  bytes.set(tail, head.length + signed.body.length);
  return bytes;
}

/** The answer an app reads. */
export function responseOf(answer: Answer, boundary: string): Response {
  if (answer.part === null) return new Response(null, { status: 204, headers: ANSWER_HEADERS });
  return new Response(multipartOf(answer.part, answer.signed, boundary), {
    status: 200,
    headers: { ...ANSWER_HEADERS, "content-type": `multipart/mixed; boundary=${boundary}` },
  });
}

/**
 * Answers a request of an app. It reads the store and writes nothing, and keeps nothing of the
 * request: not its address, not the id the app sends of its installation.
 */
export async function answer(request: Request, store: Store): Promise<Response> {
  if (new URL(request.url).pathname !== "/") return new Response("Not found", { status: 404 });
  if (request.method !== "GET") {
    return new Response("Method not allowed", { status: 405, headers: { allow: "GET" } });
  }
  const asked = readAsked(request.headers);
  if ("status" in asked) return new Response(asked.reason, { status: asked.status });
  try {
    return responseOf(await answerOf(asked, store), `update-${crypto.randomUUID()}`);
  } catch {
    return new Response("Unavailable", { status: 503, headers: ANSWER_HEADERS });
  }
}
