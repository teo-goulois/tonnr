import exifr from "exifr";

import type { Point } from "@repo/db/schema/reports";

import type { FileTime } from "./report-checks";
import type { Probed } from "./video";

// What a photo or a video of a report says of where and when it was taken, read from the file
// sent before the worker writes a copy that says nothing of it. Decision 067.

/** Where and when a file says it was taken. Each is null when it says nothing of it. */
export type Taken = { point: Point | null; time: FileTime | null };

const isPoint = (latitude: unknown, longitude: unknown): latitude is number =>
  typeof latitude === "number" &&
  typeof longitude === "number" &&
  Number.isFinite(latitude) &&
  Number.isFinite(longitude) &&
  Math.abs(latitude) <= 90 &&
  Math.abs(longitude) <= 180 &&
  // A camera that had no fix may write zeros.
  !(latitude === 0 && longitude === 0);

/** The GPS's date and time, which are UTC: "2026:10:18" and [9, 30, 12]. */
function gpsTime(date: unknown, time: unknown) {
  if (typeof date !== "string" || !Array.isArray(time) || time.length < 3) return null;
  const day = /^(\d{4}):(\d{2}):(\d{2})$/.exec(date.trim());
  if (!day) return null;
  const [hours, minutes, seconds] = time.map(Number);
  const at = Date.UTC(
    Number(day[1]),
    Number(day[2]) - 1,
    Number(day[3]),
    hours ?? 0,
    minutes ?? 0,
    Math.floor(seconds ?? 0),
  );
  return Number.isFinite(at) ? new Date(at) : null;
}

/** A camera's time with its offset: "2026:10:18 11:30:00" and "+02:00". */
function offsetTime(local: string, offset: string) {
  const parts = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(local.trim());
  const zone = /^([+-])(\d{2}):?(\d{2})$/.exec(offset.trim());
  if (!parts || !zone) return null;
  const at = new Date(
    `${parts[1]}-${parts[2]}-${parts[3]}T${parts[4]}:${parts[5]}:${parts[6]}${zone[1]}${zone[2]}:${zone[3]}`,
  );
  return Number.isNaN(at.getTime()) ? null : at;
}

/** What a photo's EXIF says of where and when it was taken. A file without EXIF says nothing. */
export async function readPhoto(file: Uint8Array): Promise<Taken> {
  let tags: Record<string, unknown> | undefined;
  try {
    // The values as they are written: a date is read here, not in the worker's time zone.
    tags = (await exifr.parse(Buffer.from(file), {
      tiff: true,
      exif: true,
      gps: true,
      reviveValues: false,
      translateValues: false,
    })) as Record<string, unknown> | undefined;
  } catch {
    tags = undefined;
  }
  if (!tags) return { point: null, time: null };

  let point: Point | null = null;
  try {
    const gps = await exifr.gps(Buffer.from(file));
    if (gps && isPoint(gps.latitude, gps.longitude)) {
      point = { latitude: gps.latitude, longitude: gps.longitude };
    }
  } catch {
    point = null;
  }

  const gpsAt = gpsTime(tags.GPSDateStamp, tags.GPSTimeStamp);
  const original = typeof tags.DateTimeOriginal === "string" ? tags.DateTimeOriginal : null;
  const offset =
    typeof tags.OffsetTimeOriginal === "string"
      ? tags.OffsetTimeOriginal
      : typeof tags.OffsetTime === "string"
        ? tags.OffsetTime
        : null;
  const withOffset = original && offset ? offsetTime(original, offset) : null;
  const time: FileTime | null = gpsAt
    ? { source: "gps", at: gpsAt }
    : withOffset
      ? { source: "offset", at: withOffset }
      : original
        ? { source: "local", local: original }
        : null;
  return { point, time };
}

/** A point written as ISO 6709, as a phone writes it in a video: "+43.4832-001.5586+012.345/". */
export function readIso6709(location: string | null): Point | null {
  if (!location) return null;
  const found = /^([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)/.exec(location.trim());
  if (!found) return null;
  const latitude = Number(found[1]);
  const longitude = Number(found[2]);
  return isPoint(latitude, longitude) ? { latitude, longitude } : null;
}

/** What a video's container says of where and when it was filmed, as ffprobe read it. */
export function readVideo(probed: Pick<Probed, "location" | "creationTime">): Taken {
  const point = readIso6709(probed.location);
  // An iPhone's date says its offset, "2026-10-18T11:30:00+0200"; the container's own is UTC.
  const written = probed.creationTime?.trim().replace(/([+-]\d{2})(\d{2})$/, "$1:$2") ?? null;
  const at = written ? new Date(written) : null;
  return {
    point,
    time: at && !Number.isNaN(at.getTime()) ? { source: "video", at } : null,
  };
}
