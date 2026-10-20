import type { Part } from "@repo/client/alerts/alert-words";
import type { TidePoint } from "@repo/client/alerts/tide-band";
import type { AlertCriteria, AlertPreview, TideExtremes } from "@repo/client/viewer/types";
import { useSyncExternalStore } from "react";

// What the sheet of a part reads of the editor it was opened over, and what it changes there.
// A part opens in a sheet of its own, the platform's, over the editor's sheet: two screens of
// the navigation, which share no React state. The editor says here what it holds each time it
// is drawn, and the part's sheet draws itself from it and writes through it, so that the
// sentence behind follows every move of a slider. One editor is open at a time. Decision 031,
// "The editor".

/** A part of the sentence: a part of the conditions, or the shortest window. */
export type PartKey = Part | "shortest";

type Hour = AlertPreview["spots"][number]["hours"][number];

export type Writing = {
  /** The editor that says it, which alone takes it back. */
  owner: string;
  criteria: AlertCriteria;
  shortestMinutes: number;
  /** How many parts of a new alert are said: the one at this index is the one to answer. */
  revealed: number;
  /** The account's time zone, which days and hours are read in. Undefined for the phone's. */
  zone: string | undefined;
  /** The windows of the week as the editor judges them: a count, and a dot for each day. */
  week: { count: number | null; days: boolean[] };
  /** The forecast's hour now at the place, for a direction to start around. */
  hourNow: Hour | undefined;
  /** The tide at the place over the two days ahead, its turns, and whether a coast has it. */
  tide: TidePoint[];
  extremes: TideExtremes["extremes"];
  hasTide: boolean;
  /** Whether the coast prints a coefficient on its high waters. */
  hasCoefficients: boolean;
  /** How long the parts of the cycle asked last, in minutes. Null when nothing says. */
  tideLasts: number | null;
  /** Where the wind comes from when it blows straight off the shore, where the place says. */
  offshore: number | null;
  setValue: (key: Part, index: number, value: unknown, moving?: boolean) => void;
  setShortest: (minutes: number) => void;
  /**
   * The sheet left a value of a part: an other value left empty goes, and once the sheet
   * closes, a new alert says its next part.
   */
  left: (key: PartKey, index: number, closing: boolean) => void;
};

let writing: Writing | null = null;
const listeners = new Set<() => void>();

function tell() {
  for (const listener of listeners) listener();
}

/** Says what the editor holds now. */
export function publishWriting(next: Writing) {
  writing = next;
  tell();
}

/** Takes back what an editor said, as it closes: a sheet that is still open then closes too. */
export function withdrawWriting(owner: string) {
  if (writing?.owner !== owner) return;
  writing = null;
  tell();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** What the editor that is open holds, drawn again each time it changes. Null with none open. */
export function useWriting() {
  return useSyncExternalStore(subscribe, () => writing);
}

/** What the editor holds, read once. */
export const readWriting = () => writing;
