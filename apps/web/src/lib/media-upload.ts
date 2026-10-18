import { kindOfType, MEDIA_MOST_BYTES, type MediaKind } from "@repo/config/media";

// What the browser does with a photo or a video before the API hears of it: which kind it is,
// how long a video lasts, and the sending of the file to the address the API signed. Decision 066.

// The types a file's name says, for a browser that gives a file no type: a computer's HEIF.
const TYPES_BY_NAME: Record<string, string> = {
  heic: "image/heic",
  heif: "image/heif",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};

/** The type a file is sent as: the one the browser gives, or the one its name says. */
export function typeOfFile(file: Pick<File, "type" | "name">) {
  if (file.type) return file.type.toLowerCase();
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return TYPES_BY_NAME[extension] ?? "";
}

/** Why a file is not sent, before anything is asked. */
export type Refusal = "type" | "size";

/** The kind of a file, or why it is not taken. */
export function judgeFile(file: Pick<File, "type" | "name" | "size">): MediaKind | Refusal {
  const kind = kindOfType(typeOfFile(file));
  if (!kind) return "type";
  if (file.size > MEDIA_MOST_BYTES[kind]) return "size";
  return kind;
}

/** Whether this browser draws a file of this type itself: a HEIF only Safari does. */
export function canPreview(type: string) {
  if (type !== "image/heic" && type !== "image/heif") return true;
  return (
    typeof navigator !== "undefined" && /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
  );
}

/** How long a video lasts, as the browser reads it. Null when it cannot read it. */
export function videoSeconds(file: Blob): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    const done = (seconds: number | null) => {
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      resolve(seconds);
    };
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () => done(Number.isFinite(video.duration) ? video.duration : null);
    video.onerror = () => done(null);
    video.src = url;
  });
}

/** Where the API said to send a file. */
export type UploadTarget = { url: string; headers: Record<string, string> };

/**
 * Sends a file to the address the API signed, saying how much of it went as it goes: fetch
 * says nothing of what it sends, so this is a request of the old kind. Rejects when the bucket
 * refuses it, when the network fails, and when `signal` stops it.
 */
export function putFile(
  target: UploadTarget,
  file: Blob,
  onProgress: (sent: number) => void,
  signal?: AbortSignal,
) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Stopped", "AbortError"));
      return;
    }
    const request = new XMLHttpRequest();
    request.open("PUT", target.url);
    for (const [name, value] of Object.entries(target.headers)) {
      request.setRequestHeader(name, value);
    }
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    request.onload = () =>
      request.status >= 200 && request.status < 300
        ? resolve()
        : reject(new Error(`The bucket answered ${request.status}`));
    request.onerror = () => reject(new Error("The file could not be sent"));
    request.onabort = () => reject(new DOMException("Stopped", "AbortError"));
    signal?.addEventListener("abort", () => request.abort(), { once: true });
    request.send(file);
  });
}
