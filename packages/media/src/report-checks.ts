import type {
  Analysis,
  MediaChecks,
  Point,
  PositionCheck,
  ReportReason,
  TimeCheck,
} from "@repo/db/schema/reports";

export type { Analysis, MediaChecks, Point, PositionCheck, ReportReason, TimeCheck };

// The rules a photo or a video of a report is held to before everyone sees it: taken at the break,
// lately, and of the sea. They read no clock and no database: what they judge is given to them.
// What a file says of itself is easy to change: these checks tell a mistake, a photo of another
// day or of another place, not a lie. Decision 067.

/** How far from the break a photo may be taken: from the beach, a cliff or a car park. */
export const REPORT_RADIUS_KM = 2;
/** How long ago it may have been taken: the sea of a report is the sea of now. */
export const REPORT_FRESH_MINUTES = 120;
/** How far ahead of the time it was sent a camera's clock is forgiven. */
export const CLOCK_AHEAD_MINUTES = 15;
/** How precise a phone must say its position is, when the file gives none. */
export const DEVICE_MOST_METERS = 1000;

/** The distance between two points on the Earth, in kilometres. */
export function distanceKm(one: Point, other: Point) {
  const radians = Math.PI / 180;
  const dLat = (other.latitude - one.latitude) * radians;
  const dLon = (other.longitude - one.longitude) * radians;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(one.latitude * radians) * Math.cos(other.latitude * radians) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Where a medium was taken: where the file says, else where the phone said it was as the report
 * was sent. An iPhone's browser takes the place out of a photo taken in the form, and out of one
 * of the library unless the person asks to keep it: the phone's own position stands for it.
 */
export function checkPosition(
  file: Point | null,
  device: (Point & { accuracyM: number | null }) | null,
  at: Point,
): PositionCheck {
  const source = file ? "file" : device ? "device" : null;
  const point = file ?? device;
  if (!point || !source) {
    return { source: null, distanceKm: null, accuracyM: null, point: null, reason: "no_position" };
  }
  const distance = Math.round(distanceKm(point, at) * 10) / 10;
  const accuracyM = source === "device" ? (device?.accuracyM ?? null) : null;
  const reason =
    distance > REPORT_RADIUS_KM
      ? ("too_far" as const)
      : source === "device" && (accuracyM === null || accuracyM > DEVICE_MOST_METERS)
        ? ("imprecise" as const)
        : null;
  return {
    source,
    // Further than the radius, the distance alone is kept, to the kilometre.
    distanceKm: reason === "too_far" ? Math.round(distance) : distance,
    accuracyM,
    point: reason === "too_far" ? null : { latitude: point.latitude, longitude: point.longitude },
    reason,
  };
}

/** When a file says it was taken, as it says it. */
export type FileTime =
  // The time of the GPS, which is UTC.
  | { source: "gps"; at: Date }
  // The camera's time with the offset it was taken at.
  | { source: "offset"; at: Date }
  // The camera's time alone, as "2026:10:18 09:12:00": read at the offset of the browser that
  // sent it, which is nearly always the phone that took it.
  | { source: "local"; local: string }
  // The time a video was filmed, as its container says it.
  | { source: "video"; at: Date };

/** The moment a camera's time alone stands for, at the browser's offset. Null when unreadable. */
export function readLocalTime(local: string, offsetMinutes: number) {
  const parts = /^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(local);
  if (!parts) return null;
  const [, year, month, day, hour, minute, second] = parts.map(Number);
  const utc = Date.UTC(year!, month! - 1, day!, hour!, minute!, second!);
  // A browser's offset is what is added to its local time to make UTC: -120 in Paris in summer.
  const at = new Date(utc + offsetMinutes * 60_000);
  return Number.isNaN(at.getTime()) ? null : at;
}

/**
 * When a medium was taken: when the file says, else, for one whose place the phone gave, when it
 * was sent, since such a file is one the phone's browser stripped as it was taken. A file that
 * says where and not when is not taken.
 */
export function checkTime(
  file: FileTime | null,
  sent: { at: Date; offsetMinutes: number | null; positionSource: PositionCheck["source"] },
): TimeCheck {
  let takenAt: Date | null = null;
  if (file?.source === "local") {
    takenAt = sent.offsetMinutes === null ? null : readLocalTime(file.local, sent.offsetMinutes);
  } else if (file) {
    takenAt = file.at;
  }
  if (!takenAt) {
    if (sent.positionSource === "device") {
      return { source: "sent", takenAt: sent.at.toISOString(), ageMinutes: 0, reason: null };
    }
    return { source: null, takenAt: null, ageMinutes: null, reason: "no_time" };
  }
  const ageMinutes = Math.round((sent.at.getTime() - takenAt.getTime()) / 60_000);
  return {
    source: file?.source ?? null,
    takenAt: takenAt.toISOString(),
    ageMinutes,
    reason:
      ageMinutes < -CLOCK_AHEAD_MINUTES
        ? "ahead"
        : ageMinutes > REPORT_FRESH_MINUTES
          ? "too_old"
          : null,
  };
}

/** How sure the analysis must be that it is the sea, and that it is not, to decide alone. */
export const SEA_PASSES = 0.6;
export const SEA_FAILS = 0.3;
/** How sure it must be of nudity to refuse, and to ask an operator. */
export const NUDITY_FAILS = 0.85;
export const NUDITY_ASKS = 0.5;

/** What the analysis decides alone, or leaves to an operator. */
export function judgeAnalysis(analysis: Analysis): {
  verdict: "passed" | "refused" | "review";
  reason: "not_sea" | "nudity" | "unsure" | null;
} {
  if (analysis.nudity >= NUDITY_FAILS) return { verdict: "refused", reason: "nudity" };
  if (analysis.nudity >= NUDITY_ASKS) return { verdict: "review", reason: "unsure" };
  if (analysis.sea >= SEA_PASSES) return { verdict: "passed", reason: null };
  if (analysis.sea < SEA_FAILS) return { verdict: "refused", reason: "not_sea" };
  return { verdict: "review", reason: "unsure" };
}

/** What the checks of one medium come to. The place and the time are checked before the sea. */
export function judgeMedium(
  position: PositionCheck,
  time: TimeCheck,
  analysis: Analysis | null,
): MediaChecks {
  const reasons: ReportReason[] = [];
  if (position.reason) reasons.push(position.reason);
  if (time.reason) reasons.push(time.reason);
  if (reasons.length > 0) return { position, time, analysis, verdict: "refused", reasons };
  if (!analysis) return { position, time, analysis, verdict: "review", reasons: ["unsure"] };
  const judged = judgeAnalysis(analysis);
  return {
    position,
    time,
    analysis,
    verdict: judged.verdict,
    reasons: judged.reason ? [judged.reason] : [],
  };
}

/**
 * What a report comes to once each of its media is judged: refused when one is, left to an
 * operator when one is unsure, shown when every one passed. A medium that could not be made at
 * all refuses it.
 */
export function judgeReport(media: readonly ({ verdict: MediaChecks["verdict"] } | null)[]) {
  if (media.length === 0 || media.some((one) => one === null || one.verdict === "refused")) {
    return "refused" as const;
  }
  if (media.some((one) => one?.verdict === "review")) return "review" as const;
  return "published" as const;
}
