import type { Hotkey } from "@tanstack/react-hotkeys";

// Every keyboard shortcut of the app, by action. A palette and a way to rebind them will read
// this list too.
export const SHORTCUTS = {
  toggleTheme: { hotkey: "D" },
} as const satisfies Record<string, { hotkey: Hotkey }>;
