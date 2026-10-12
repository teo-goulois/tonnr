import { useSyncExternalStore } from "react";

// PROTOTYPE, not for main: the looks of a phone's bar that Téo compares, and the art of its tabs.
// The browser keeps the choice, so that a look stays while he goes from one screen to another.
export const NAV_LOOKS = ["current", "fill", "line", "bare", "floating"] as const;
export type NavLook = (typeof NAV_LOOKS)[number];

export const NAV_ART = ["a", "b"] as const;
export type NavArt = (typeof NAV_ART)[number];

type Choice = { look: NavLook; art: NavArt };

const KEY = "prototype:bottom-nav";
const FIRST: Choice = { look: "fill", art: "a" };

let choice: Choice | undefined;
const listeners = new Set<() => void>();

function read(): Choice {
  if (choice) return choice;
  try {
    const kept = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Choice> | null;
    choice = {
      look: NAV_LOOKS.find((look) => look === kept?.look) ?? FIRST.look,
      art: NAV_ART.find((art) => art === kept?.art) ?? FIRST.art,
    };
  } catch {
    choice = FIRST;
  }
  return choice;
}

export function setNavPrototype(next: Partial<Choice>) {
  choice = { ...read(), ...next };
  try {
    localStorage.setItem(KEY, JSON.stringify(choice));
  } catch {
    // A browser that keeps nothing still shows the look until the page is left.
  }
  for (const listener of listeners) listener();
}

export function useNavPrototype(): Choice {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    read,
    () => FIRST,
  );
}
