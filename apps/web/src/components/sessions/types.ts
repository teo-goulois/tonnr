import type { MediaKind, MediaPurpose } from "@repo/config/media";

import type {
  Loadable,
  MediaItem,
  MediaStatus,
  Session,
  SessionDetail,
  SessionRecap,
} from "../viewer/types";

/** How big the waves of a session looked, from `ankle` to `triple_overhead`. */
export type SurfSize = NonNullable<Session["waveSize"]>;

/** Where a session is: a break of the catalogue or a spot of the account's own. */
export type SessionPlace = { kind: "break" | "spot"; id: string; name: string };

/** A session as its form holds it. */
export type SessionDraft = {
  startedAt: Date;
  durationMinutes: number;
  // From 1 to 5. Null for a session that is not rated.
  rating: number | null;
  note: string;
  // How big most of the waves and the sets looked. Null while the surfer has not said.
  waveSize: SurfSize | null;
  setSize: SurfSize | null;
  // The photos and the videos it keeps, in their order. Decision 066.
  mediaIds: string[];
};

/** What the sheet of a session is open on: a new one, at a place when it is known, or one of the log. */
export type SessionOpen = { place?: SessionPlace; sessionId?: string };

/** What the screens of the sessions read and ask for, which the route answers. */
export type Sessioning = {
  // The log, the latest session first, and what it comes to. Read where it shows.
  log: Loadable<Session[]>;
  recap: Loadable<SessionRecap>;
  // The sessions at the place whose panel is open.
  here: Loadable<Session[]>;
  // What the sheet is open on, and the session of the log it shows, with its conditions.
  open: SessionOpen | null;
  detail: Loadable<SessionDetail>;
  // Begins a session: at a place when one is given, and otherwise by asking where.
  onBegin: (place?: SessionPlace) => void;
  onOpen: (session: Session) => void;
  onClose: () => void;
  isSaving: boolean;
  // Writes a session at a place. Answers whether it was kept.
  onAdd: (place: SessionPlace, draft: SessionDraft) => Promise<boolean>;
  // Changes one: what of it was changed, or nothing, to have its conditions read once more.
  onChange: (session: Session, changed: Partial<SessionDraft>) => Promise<boolean>;
  isDeleting: boolean;
  onDelete: (session: Session) => Promise<boolean>;
  media: SessionMedia;
};

/** The photos and the videos of the sessions, for the screens that show and send them. */
export type SessionMedia = {
  // Whether the instance takes them, and whether an operator stopped uploads. Undefined while it
  // is asked.
  status: MediaStatus | undefined;
  // The media of the session the sheet is open on.
  open: Loadable<MediaItem[]>;
  // The media of the sessions of the log and of the place that is open, by session.
  bySession: Readonly<Record<string, MediaItem[]>>;
  uploads: ReadonlyMap<string, Upload>;
  // Starts sending files: answers the keys of those taken.
  onStart: (files: File[]) => string[];
  onRetry: (key: string) => void;
  // Takes a file being sent out of a form. `discard` deletes it from the API, for one that no
  // session was given yet.
  onDrop: (key: string, discard: boolean) => void;
  // Forgets the files sent from a form that closed.
  onForget: (keys: string[]) => void;
};

/** A photo or a video being sent from this browser, or that was. Decision 066. */
export type Upload = {
  key: string;
  name: string;
  // What it was sent for: a session, or a report at a break.
  purpose: MediaPurpose;
  kind: MediaKind;
  type: string;
  // An address of the browser that draws the file while it goes, which a form shows.
  preview: string;
  // How much of it went, from 0 to 1.
  progress: number;
  // `sending` until the bucket holds it and the API heard so, then `sent`, or `failed`.
  state: "sending" | "sent" | "failed";
  error: string | null;
  // The medium's id, once the API gave one: what a session is saved with.
  id: string | null;
};
