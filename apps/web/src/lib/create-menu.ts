import { useSyncExternalStore } from "react";

// Whether the sheet that asks what to add is open. A phone's bar of tabs opens it from its
// "+", and stands outside the viewer, which draws the sheet and knows the account's spots: a
// module-level store lets one open the other, as the dialog of the shortcuts is opened.

let isOpen = false;
const listeners = new Set<() => void>();

function set(next: boolean) {
  if (isOpen === next) return;
  isOpen = next;
  for (const listener of listeners) listener();
}

/** Opens the sheet. Nothing draws it before the map is there: it then stays closed. */
export function openCreateMenu() {
  if (listeners.size > 0) set(true);
}

export function closeCreateMenu() {
  set(false);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    // Whoever drew the sheet is gone: it does not open by itself when the map comes back.
    if (listeners.size === 0) isOpen = false;
  };
}

/** Whether the sheet is open, for what draws it. */
export function useCreateMenu() {
  return useSyncExternalStore(
    subscribe,
    () => isOpen,
    () => false,
  );
}
