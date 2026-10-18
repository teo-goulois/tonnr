// What a photo or a video may be, for the API that takes one and the web app that checks it
// before it asks. Decision 066.

/** The two kinds of media. */
export const MEDIA_KINDS = ["photo", "video"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

/** What a medium is sent for: a session of the account's log, or a report at a break. */
export const MEDIA_PURPOSES = ["session", "report"] as const;
export type MediaPurpose = (typeof MEDIA_PURPOSES)[number];

/**
 * The types a file is taken in, by kind, as a browser names them. A phone's own formats are
 * among them: the worker turns each one into what every browser reads.
 */
export const MEDIA_TYPES = {
  photo: ["image/jpeg", "image/png", "image/webp", "image/avif", "image/heic", "image/heif"],
  video: ["video/mp4", "video/quicktime", "video/webm"],
} as const satisfies Record<MediaKind, readonly string[]>;

/** The kind of a type, or null for a type that is taken in neither. */
export function kindOfType(type: string): MediaKind | null {
  const lower = type.toLowerCase();
  for (const kind of MEDIA_KINDS) {
    if ((MEDIA_TYPES[kind] as readonly string[]).includes(lower)) return kind;
  }
  return null;
}

const MB = 1024 * 1024;

/** The largest file sent, by kind, before the worker makes it smaller. */
export const MEDIA_MOST_BYTES = { photo: 40 * MB, video: 1024 * MB } as const;

/** How long a video may last, in seconds, by what it is sent for. */
export const VIDEO_MOST_SECONDS = { session: 60, report: 30 } as const;

/** How many photos and videos a session keeps. */
export const SESSION_MOST_MEDIA = 10;

/** How much an account keeps, once the worker made each file smaller. */
export const ACCOUNT_MOST_BYTES = 2048 * MB;

/** The forms of a medium the worker keeps, which an address of the API names. */
export const MEDIA_VARIANTS = ["thumb", "display", "poster", "video"] as const;
export type MediaVariant = (typeof MEDIA_VARIANTS)[number];
