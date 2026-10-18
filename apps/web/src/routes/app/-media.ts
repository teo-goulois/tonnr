import type { MediaPurpose } from "@repo/config/media";
import { useSyncExternalStore } from "react";
import { toast } from "sonner";

import type { Upload } from "@/components/sessions/types";
import { judgeFile, putFile, typeOfFile, videoSeconds } from "@/lib/media-upload";
import { m } from "@/paraglide/messages.js";
import { client } from "@/utils/orpc";

// The photos and the videos being sent from this browser, for the forms of the sessions and of
// the reports (decision 067). They
// are kept here and not in a form, so that one goes on being sent once its form is closed: a
// session saved while a video still goes up keeps it. Decision 066.

const kept = new Map<string, Upload>();
const files = new Map<string, File>();
const stops = new Map<string, AbortController>();
// The files whose form closed while they went up: each is forgotten once it went.
const released = new Set<string>();
const listeners = new Set<() => void>();
let snapshot: ReadonlyMap<string, Upload> = new Map();

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
  return () => listeners.delete(listener);
}

/** The files being sent, which a component is drawn again by when one moves. */
export function useUploads() {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => snapshot,
  );
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
  const file = files.get(key);
  const upload = kept.get(key);
  if (!file || !upload) return;
  const stop = new AbortController();
  stops.set(key, stop);
  patch(key, { state: "sending", progress: 0, error: null });
  try {
    const durationSeconds = upload.kind === "video" ? await videoSeconds(file) : null;
    const asked = await client.v1.media.prepare({
      purpose: upload.purpose,
      contentType: upload.type,
      bytes: file.size,
      ...(durationSeconds !== null && { durationSeconds }),
    });
    // Taken out of its form while the API answered: what it signed is let go.
    if (stop.signal.aborted) {
      void client.v1.media.discard({ id: asked.id }).catch(() => {});
      return;
    }
    patch(key, { id: asked.id });
    // A few frames of progress a second are enough for a ring.
    let shown = 0;
    await putFile(
      asked.upload,
      file,
      (sent) => {
        if (sent - shown < 0.02 && sent < 1) return;
        shown = sent;
        patch(key, { progress: sent });
      },
      stop.signal,
    );
    await client.v1.media.uploaded({ id: asked.id });
    patch(key, { state: "sent", progress: 1 });
  } catch (error) {
    if (stop.signal.aborted) return;
    const words = failureOf(error, upload);
    patch(key, { state: "failed", error: words });
    toast.error(words);
  } finally {
    stops.delete(key);
    if (released.has(key)) {
      release(key);
      changed();
    }
  }
}

/**
 * Starts sending files, each as soon as it is taken. Answers the key of each file taken, and
 * each file refused with why, before anything was asked of the API.
 */
export function startUploads(chosen: readonly File[], purpose: MediaPurpose = "session") {
  const started: string[] = [];
  const refused: { name: string; why: "type" | "size" }[] = [];
  for (const file of chosen) {
    const judged = judgeFile(file);
    if (judged === "type" || judged === "size") {
      refused.push({ name: file.name, why: judged });
      continue;
    }
    const key = crypto.randomUUID();
    files.set(key, file);
    kept.set(key, {
      key,
      name: file.name,
      purpose,
      kind: judged,
      type: typeOfFile(file),
      preview: URL.createObjectURL(file),
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

/** Lets go of a file: its address in the browser, the file itself, and its line. */
function release(key: string) {
  const upload = kept.get(key);
  if (upload) URL.revokeObjectURL(upload.preview);
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
