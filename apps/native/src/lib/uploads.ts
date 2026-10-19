import type { Upload } from "@repo/client/sessions/types";
import type { MediaPurpose } from "@repo/config/media";
import { File, UploadType } from "expo-file-system";
import type { ImagePickerAsset } from "expo-image-picker";
import { useSyncExternalStore } from "react";

import {
  judgePicked,
  nameOfPicked,
  typeOfPicked,
  videoSecondsOf,
} from "@/components/media/media-files";
import { m } from "@/paraglide/messages";
import { client } from "@/utils/orpc";

// The photos and the videos being sent from this phone, for the forms of the sessions and of the
// reports. They are kept here and not in a form, so that one goes on being sent once its sheet is
// closed: a session saved while a video still goes up keeps it, as the web's `-media.ts` keeps a
// browser's. Each file goes straight to the bucket, at the address `media.prepare` signed, through
// the phone's own upload, which iOS carries on while the app is in the background. Decision 066.

const kept = new Map<string, Upload>();
const files = new Map<string, ImagePickerAsset>();
const stops = new Map<string, AbortController>();
// The files whose form closed while they went up: each is forgotten once it went.
const released = new Set<string>();
const listeners = new Set<() => void>();
let snapshot: ReadonlyMap<string, Upload> = new Map();
let made = 0;

function changed() {
  snapshot = new Map(kept);
  for (const listener of listeners) listener();
}

function patch(key: string, change: Partial<Upload>) {
  const upload = kept.get(key);
  if (!upload) return;
  kept.set(key, { ...upload, ...change });
  changed();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** The files being sent, which a component is drawn again by when one moves. */
export function useUploads() {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => snapshot,
  );
}

/** The files being sent, as they stand now: for what reads them outside a component. */
export function currentUploads() {
  return snapshot;
}

/** How many bytes a file holds, as the phone keeps it: the size an upload is signed for. */
function bytesOf(asset: ImagePickerAsset) {
  try {
    const size = new File(asset.uri).size;
    if (typeof size === "number" && size > 0) return size;
  } catch {
    // A file the phone does not let the app read is judged on what the picker said.
  }
  return asset.fileSize ?? 0;
}

/** Why a file was not sent, in the reader's words. */
function failureOf(error: unknown, upload: Upload) {
  const refused = error as { code?: string; data?: { media?: string } };
  if (refused.code === "FORBIDDEN" && refused.data?.media === "full") return m.media_full();
  if (refused.code === "TOO_MANY_REQUESTS") return m.media_hour();
  if (refused.code === "SERVICE_UNAVAILABLE") return m.media_paused();
  // The type and the size were judged here: what the API refuses of a video is its length.
  if (refused.code === "BAD_REQUEST" && upload.kind === "video") {
    return m.media_too_long_video({ name: upload.name });
  }
  return m.media_send_failed({ name: upload.name });
}

async function send(key: string) {
  const asset = files.get(key);
  const upload = kept.get(key);
  if (!asset || !upload) return;
  const stop = new AbortController();
  stops.set(key, stop);
  patch(key, { state: "sending", progress: 0, error: null });
  try {
    const durationSeconds = upload.kind === "video" ? videoSecondsOf(asset) : null;
    const asked = await client.v1.media.prepare({
      purpose: upload.purpose,
      contentType: upload.type,
      bytes: bytesOf(asset),
      ...(durationSeconds !== null && { durationSeconds }),
    });
    // Taken out of its form while the API answered: what it signed is let go.
    if (stop.signal.aborted) {
      void client.v1.media.discard({ id: asked.id }).catch(() => {});
      return;
    }
    patch(key, { id: asked.id });
    // A few steps of progress a second are enough for a ring.
    let shown = 0;
    const answer = await new File(asset.uri).upload(asked.upload.url, {
      httpMethod: "PUT",
      uploadType: UploadType.BINARY_CONTENT,
      headers: asked.upload.headers,
      signal: stop.signal,
      onProgress: ({ bytesSent, totalBytes }) => {
        if (totalBytes <= 0) return;
        const sent = bytesSent / totalBytes;
        if (sent - shown < 0.02 && sent < 1) return;
        shown = sent;
        patch(key, { progress: sent });
      },
    });
    if (answer.status < 200 || answer.status >= 300) {
      throw new Error(`The bucket answered ${answer.status}`);
    }
    await client.v1.media.uploaded({ id: asked.id });
    patch(key, { state: "sent", progress: 1 });
  } catch (error) {
    if (stop.signal.aborted) return;
    patch(key, { state: "failed", error: failureOf(error, upload) });
  } finally {
    stops.delete(key);
    if (released.has(key)) {
      release(key);
      changed();
    }
  }
}

/** A file the phone gave that is not sent, and why. */
export type Refused = { name: string; why: "type" | "size" };

/**
 * Starts sending files, each as soon as it is taken. Answers the key of each file taken, and
 * each file refused with why, before anything was asked of the API.
 */
export function startUploads(chosen: readonly ImagePickerAsset[], purpose: MediaPurpose) {
  const started: string[] = [];
  const refused: Refused[] = [];
  for (const asset of chosen) {
    const name = nameOfPicked(asset);
    const judged = judgePicked(asset, bytesOf(asset));
    if (judged === "type" || judged === "size") {
      refused.push({ name, why: judged });
      continue;
    }
    made += 1;
    const key = `${Date.now().toString(36)}-${made}`;
    files.set(key, asset);
    kept.set(key, {
      key,
      name,
      purpose,
      kind: judged,
      type: typeOfPicked(asset),
      preview: asset.uri,
      progress: 0,
      state: "sending",
      error: null,
      id: null,
    });
    started.push(key);
  }
  changed();
  for (const key of started) void send(key);
  return { started, refused };
}

/** Sends a file that failed once more, from the start. */
export function retryUpload(key: string) {
  void send(key);
}

/**
 * Takes a file out of a form: it stops going up, and is deleted from the API when `discard`
 * says it belongs to no session yet.
 */
export function dropUpload(key: string, discard: boolean) {
  const upload = kept.get(key);
  stops.get(key)?.abort();
  release(key);
  changed();
  if (discard && upload?.id) void client.v1.media.discard({ id: upload.id }).catch(() => {});
}

/** Lets go of a file and its line. The phone's copy is the picker's, in the app's cache. */
function release(key: string) {
  kept.delete(key);
  files.delete(key);
  released.delete(key);
}

/**
 * Forgets the files of a form that closed: the session shows them from the API now. One still
 * going up goes on, and is forgotten once it went.
 */
export function forgetSent(keys: readonly string[]) {
  for (const key of keys) {
    if (kept.get(key)?.state === "sending") released.add(key);
    else release(key);
  }
  changed();
}

/** Whether some of the media of `ids` still go up from this phone. */
export function stillSending(ids: readonly string[]) {
  return [...kept.values()].some(
    (upload) => upload.state === "sending" && ids.includes(upload.id ?? ""),
  );
}
