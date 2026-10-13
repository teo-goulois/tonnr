import type { Loadable, Session, SessionDetail, SessionRecap } from "../viewer/types";

/** Where a session is: a break of the catalogue or a spot of the account's own. */
export type SessionPlace = { kind: "break" | "spot"; id: string; name: string };

/** A session as its form holds it. */
export type SessionDraft = {
  startedAt: Date;
  durationMinutes: number;
  // From 1 to 5. Null for a session that is not rated.
  rating: number | null;
  note: string;
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
};
