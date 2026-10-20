import type { SessionPlace } from "@repo/client/sessions/types";
import { useSyncExternalStore } from "react";

import {
  hideSession,
  sessionShownNow,
  showSession,
  updateSession,
} from "@/activities/session-activity";
import { sessionShown } from "@/activities/session-shown";
import { sessionWriting } from "@/activities/writing";
import { inputOf } from "@/components/saved/sea-now";
import {
  type LiveSession,
  type LiveState,
  figuresOf,
  formQueryOf,
  liveStateOf,
  readLiveSession,
} from "@/components/sessions/live-logic";
import { client } from "@/utils/orpc";

// The session in progress, decision 074: the phone keeps its place and its start in the
// localStorage that expo-sqlite gives the app, and nothing tells the API, until it is written as
// decision 043 writes a session. One runs at a time. As it begins, the app shows it outside the
// app, a Live Activity on an iPhone, a Live Update on Android, and reads `places.now` once, for
// the next high and low and the wind measured then, which it adds to it. Ending it, from there
// or from the app, opens the session's form with its place, its start and its length. Signing out
// forgets it.

const KEY = "tonnr:live-session";
// How long `places.now` may take at the start: the session does not wait for the sea.
const ASK_MS = 5000;

let current: LiveSession | null | undefined;
const listeners = new Set<() => void>();

function read() {
  if (current === undefined) {
    try {
      current = readLiveSession(localStorage.getItem(KEY));
    } catch {
      current = null;
    }
  }
  return current;
}

function write(next: LiveSession | null) {
  current = next;
  try {
    if (next) localStorage.setItem(KEY, JSON.stringify(next));
    else localStorage.removeItem(KEY);
  } catch {
    // A phone that keeps nothing still times the session while the app is open.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The session in progress, or null. */
export const liveSession = read;

/** The session in progress, for a screen that is drawn again when it changes. */
export function useLiveSession() {
  return useSyncExternalStore(subscribe, read, () => null);
}

/** What the sea did at the place as the session began: null when the API did not answer. */
async function figuresAt(place: SessionPlace, at: number) {
  const late = new Promise<null>((resolve) => setTimeout(() => resolve(null), ASK_MS));
  const asked = client.v1.places
    .now(inputOf([place]))
    .then((answer) => figuresOf(answer.places[0], at))
    .catch(() => null);
  return Promise.race([asked, late]);
}

/** The session that runs, if it is still the one that began at `startedAt`. */
const stillRunning = (startedAt: number) => {
  const now = read();
  return now?.startedAt === startedAt && now.endedAt === undefined ? now : null;
};

/** Reads the sea at the session's place, keeps it, and shows it outside the app with the rest. */
async function readSea(session: LiveSession) {
  const figures = await figuresAt(session.place, session.startedAt);
  const now = stillRunning(session.startedAt);
  if (!now || now.place.id !== session.place.id) return;
  const read: LiveSession = { ...now, figures };
  write(read);
  if (read.shown) await updateSession(sessionShown(read, sessionWriting()));
}

/**
 * Starts a session at a place, now, unless one runs already, which is answered then. The time
 * counts from the press, and it shows outside the app at once: the sea is read after, and
 * added to it once it is.
 */
export async function startLiveSession(place: SessionPlace) {
  const running = read();
  if (running) return running;
  const session: LiveSession = { place, startedAt: Date.now(), figures: null, shown: false };
  write(session);
  const shown = await showSession(sessionShown(session, sessionWriting()));
  // A session that was ended or forgotten meanwhile is not kept again.
  if (!stillRunning(session.startedAt)) {
    if (shown) await hideSession();
    return read() ?? session;
  }
  write({ ...session, shown });
  await readSea({ ...session, shown });
  return read() ?? session;
}

/** Moves the session in progress to another place: its sea is read there, at its start. */
export async function moveLiveSession(place: SessionPlace) {
  const running = read();
  if (!running) return;
  const moved: LiveSession = { ...running, place, figures: null };
  write(moved);
  if (moved.endedAt !== undefined) return;
  if (moved.shown) await updateSession(sessionShown(moved, sessionWriting()));
  await readSea(moved);
}

/**
 * Ends the session in progress now, or keeps when it was ended, and takes it from the lock
 * screen: what opens its form, or null when none runs.
 */
export async function endLiveSession() {
  const running = read();
  if (!running) return null;
  const ended: LiveSession = { ...running, endedAt: running.endedAt ?? Date.now() };
  write(ended);
  await hideSession();
  return formQueryOf(ended);
}

/** What opens the form of the session kept, as it is: ended or not. */
export function liveFormQuery() {
  const running = read();
  return running ? formQueryOf(running) : null;
}

/** Forgets the session in progress: it was written, dropped, or its account left the phone. */
export async function forgetLiveSession() {
  if (read() === null) return;
  write(null);
  await hideSession();
}

/** What the session in progress is now, reading whether the phone still shows it. */
export async function liveStateNow(): Promise<LiveState | null> {
  const running = read();
  if (!running) return null;
  const stillShown = running.shown ? await sessionShownNow() : undefined;
  return liveStateOf(running, Date.now(), stillShown);
}
