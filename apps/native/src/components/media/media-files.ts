import { kindOfType, MEDIA_MOST_BYTES, type MediaKind } from "@repo/config/media";

// What the app knows of a photo or a video the phone gave it, before the API hears of it: which
// kind it is, its type, how long a video lasts, and when a photo was taken, from what its file
// says. The web's `media-upload.ts` does the same for a browser's file. Decision 066. A module that
// imports nothing of React Native, so that a test reads it.

/** What the picker of the phone gives of a file: `ImagePickerAsset`, as far as it is read here. */
export type PickedFile = {
  uri: string;
  fileName?: string | null;
  mimeType?: string;
  fileSize?: number;
  type?: "image" | "video" | "livePhoto" | "pairedVideo" | null;
  // In milliseconds, for a video.
  duration?: number | null;
  exif?: Record<string, unknown> | null;
};

// The types a file's name says, for a phone that gives a file no type.
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

/** The name a file is said by: its own, or the last part of where the phone keeps it. */
export function nameOfPicked(file: Pick<PickedFile, "uri" | "fileName">) {
  if (file.fileName) return file.fileName;
  return decodeURIComponent(file.uri.split("/").pop() ?? "") || file.uri;
}

/** The type a file is sent as: the one the phone gives, or the one its name says. */
export function typeOfPicked(file: Pick<PickedFile, "uri" | "fileName" | "mimeType">) {
  if (file.mimeType) return file.mimeType.toLowerCase();
  const extension = nameOfPicked(file).split(".").pop()?.toLowerCase() ?? "";
  return TYPES_BY_NAME[extension] ?? "";
}

/** Why a file is not sent, before anything is asked. */
export type Refusal = "type" | "size";

/** The kind of a file of `bytes`, or why it is not taken. */
export function judgePicked(
  file: Pick<PickedFile, "uri" | "fileName" | "mimeType">,
  bytes: number,
): MediaKind | Refusal {
  const kind = kindOfType(typeOfPicked(file));
  if (!kind) return "type";
  if (bytes > MEDIA_MOST_BYTES[kind]) return "size";
  return kind;
}

/** How long a video lasts, in seconds, as the phone said. Null when it said nothing. */
export function videoSecondsOf(file: Pick<PickedFile, "duration">) {
  const ms = file.duration;
  return typeof ms === "number" && Number.isFinite(ms) && ms > 0 ? ms / 1000 : null;
}

/** How long a video lasts, as "0:42". */
export function videoLength(ms: number) {
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

// A camera's clock, as EXIF writes it: "2026:10:19 08:12:33".
const EXIF_MOMENT = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/;
// The offset of that clock from UTC: "+02:00".
const EXIF_OFFSET = /^([+-])(\d{2}):?(\d{2})$/;

const textOf = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/**
 * When a photo was taken, from what its file says: the camera's clock with its offset, or the
 * camera's clock alone, read on the phone's own. Null when it says nothing a moment is read from.
 */
export function takenAt(exif: Record<string, unknown> | null | undefined): Date | null {
  if (!exif) return null;
  const clocks: [string, string][] = [
    ["DateTimeOriginal", "OffsetTimeOriginal"],
    ["DateTimeDigitized", "OffsetTimeDigitized"],
    ["DateTime", "OffsetTime"],
  ];
  for (const [clock, offset] of clocks) {
    const found = EXIF_MOMENT.exec(textOf(exif[clock]));
    if (!found) continue;
    const [year, month, day, hour, minute, second] = found
      .slice(1)
      .map((part) => Number(part ?? 0)) as [number, number, number, number, number, number];
    if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) continue;
    const shift = EXIF_OFFSET.exec(textOf(exif[offset]));
    if (shift) {
      const sign = shift[1] === "-" ? -1 : 1;
      const minutes = sign * (Number(shift[2]) * 60 + Number(shift[3]));
      return new Date(Date.UTC(year, month - 1, day, hour, minute, second) - minutes * 60_000);
    }
    return new Date(year, month - 1, day, hour, minute, second);
  }
  return null;
}

/** When the first photo of those chosen was taken, as its file says. */
export function firstTakenAt(files: readonly Pick<PickedFile, "exif" | "type">[]) {
  for (const file of files) {
    if (file.type === "video") continue;
    const moment = takenAt(file.exif);
    if (moment) return moment;
  }
  return null;
}
