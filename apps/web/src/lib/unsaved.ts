import { useSyncExternalStore } from "react";

// What is written on a screen and not saved, and the one question that is asked before it is
// left. One thing at a time holds something: the editor of an alert (decision 031). Whatever
// is about to take its place asks here first: the panel that goes back to its list, the drawer
// that closes, the router that goes elsewhere, the menu that signs out. One place holds it, so
// that one question is on screen, and one answer leaves or stays.

type Question = { leave: () => void; stay: () => void };

let held = false;
let question: Question | null = null;
const listeners = new Set<() => void>();
const tell = () => {
  for (const listener of listeners) listener();
};

/**
 * Says whether something is written that leaving would lose. Once nothing is, a question that
 * was asked no longer stands: it is answered "stay", and whatever asked may ask again and pass.
 */
export function holdUnsaved(isHeld: boolean) {
  held = isHeld;
  if (!isHeld) answerLeaving("stay");
}

/** Whether something is written that leaving would lose. */
export const hasUnsaved = () => held;

/**
 * Leaves: at once when nothing would be lost, and otherwise once its user has said so. `stay`
 * is told when they say no, or when the question no longer stands. One question is asked at a
 * time: a new one answers the one before it "stay".
 */
export function leaveWith(leave: () => void, stay: () => void = () => {}) {
  if (!held) {
    leave();
    return;
  }
  answerLeaving("stay");
  question = { leave, stay };
  tell();
}

/**
 * Answers the question that is asked, if one is. What is held stays held until whoever holds it
 * says otherwise: a leaving that fails, or that does not happen after all, leaves what was
 * written as guarded as it was. What leaves in several steps takes the later ones past whoever
 * would ask again, as a sign-out does with the page it goes to.
 */
export function answerLeaving(answer: "leave" | "stay") {
  const asked = question;
  if (!asked) return;
  question = null;
  tell();
  asked[answer]();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/** Whether the question is asked. What shows it reads this, and is drawn again when it changes. */
export function useIsLeaving() {
  return useSyncExternalStore(
    subscribe,
    () => question !== null,
    () => false,
  );
}
