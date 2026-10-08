import {
  formatForDisplay,
  normalizeHotkey,
  parseHotkey,
  useHotkey,
  useHotkeyRecorder,
} from "@tanstack/react-hotkeys";
import { useMemo, useState, useSyncExternalStore } from "react";

import { m } from "@/paraglide/messages.js";

// Every keyboard shortcut of the app. The command palette, the hotkeys and the dialog that
// rebinds them all read this list.
export const SHORTCUT_ACTIONS = [
  { id: "command-palette", label: () => m.shortcut_command_palette(), defaultHotkey: "Mod+K" },
  { id: "toggle-theme", label: () => m.shortcut_toggle_theme(), defaultHotkey: "D" },
  { id: "switch-locale", label: () => m.shortcut_switch_locale(), defaultHotkey: "L" },
] as const;

export type ShortcutAction = (typeof SHORTCUT_ACTIONS)[number];
export type ShortcutId = ShortcutAction["id"];

/** The binding in force for each action. An empty string means the user turned it off. */
export type ShortcutBindings = Record<ShortcutId, string>;

// The user's changes only: an action without an entry keeps its default.
type ShortcutOverrides = Partial<Record<ShortcutId, string>>;

const STORAGE_KEY = "tonnr:shortcuts";
const NO_OVERRIDES: ShortcutOverrides = {};
const listeners = new Set<() => void>();
let cached: { raw: string | null; overrides: ShortcutOverrides } | null = null;

function readOverrides(): ShortcutOverrides {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (cached?.raw === raw) return cached.overrides;
  let overrides = NO_OVERRIDES;
  try {
    if (raw) overrides = JSON.parse(raw) as ShortcutOverrides;
  } catch {
    // A value this app did not write: the defaults apply.
  }
  cached = { raw, overrides };
  return overrides;
}

function writeOverrides(overrides: ShortcutOverrides) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another tab changed the shortcuts.
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function resolveShortcuts(overrides: ShortcutOverrides): ShortcutBindings {
  const bindings = {} as ShortcutBindings;
  for (const action of SHORTCUT_ACTIONS) {
    bindings[action.id] = overrides[action.id] ?? normalizeHotkey(action.defaultHotkey);
  }
  return bindings;
}

/** The bindings in force. The server and the first render use the defaults. */
export function useShortcuts(): ShortcutBindings {
  const overrides = useSyncExternalStore(subscribe, readOverrides, () => NO_OVERRIDES);
  return useMemo(() => resolveShortcuts(overrides), [overrides]);
}

export function setShortcut(id: ShortcutId, hotkey: string) {
  writeOverrides({ ...readOverrides(), [id]: hotkey });
}

export function resetShortcut(id: ShortcutId) {
  const { [id]: _removed, ...rest } = readOverrides();
  writeOverrides(rest);
}

export function isDefaultShortcut(action: ShortcutAction, hotkey: string) {
  return hotkey === normalizeHotkey(action.defaultHotkey);
}

/** Runs `handler` when the action's shortcut is pressed, unless the user turned it off. */
export function useShortcut(id: ShortcutId, bindings: ShortcutBindings, handler: () => void) {
  const action = SHORTCUT_ACTIONS.find((candidate) => candidate.id === id)!;
  const hotkey = bindings[id];

  // A hotkey must be registered on every render, so a disabled one keeps its default.
  useHotkey(parseHotkey(hotkey || action.defaultHotkey), handler, {
    enabled: hotkey !== "",
    preventDefault: true,
    requireReset: true,
    stopPropagation: true,
  });
}

/** How a hotkey is written on this platform, one entry per key. */
export function shortcutTokens(hotkey: string): string[] {
  if (!hotkey) return [];
  return formatForDisplay(hotkey, { separatorToken: " " }).split(" ");
}

function conflictingAction(bindings: ShortcutBindings, id: ShortcutId, hotkey: string) {
  if (hotkey === "") return null;
  return (
    SHORTCUT_ACTIONS.find((action) => action.id !== id && bindings[action.id] === hotkey) ?? null
  );
}

/** Captures the next combination for one action, and saves it unless another action uses it. */
export function useShortcutRecorder(action: ShortcutAction, bindings: ShortcutBindings) {
  const [error, setError] = useState<string | null>(null);

  const recorder = useHotkeyRecorder({
    // The defaults name characters ("D"), so a recording keeps the character too. Recording the
    // physical key would bind another letter on an AZERTY keyboard.
    recordBy: "key",
    onRecord: (recorded) => {
      // Backspace clears the binding, which the recorder reports as an empty string.
      const captured: string = recorded;
      const next = captured === "" ? "" : normalizeHotkey(captured);
      if (next !== "" && !parseHotkey(next).key) {
        setError(m.shortcuts_incomplete());
        return;
      }
      const conflict = conflictingAction(bindings, action.id, next);
      if (conflict) {
        setError(m.shortcuts_conflict({ label: conflict.label() }));
        return;
      }
      setError(null);
      setShortcut(action.id, next);
    },
    onCancel: () => setError(null),
  });

  return {
    isRecording: recorder.isRecording,
    error,
    toggle: () => (recorder.isRecording ? recorder.cancelRecording() : recorder.startRecording()),
    reset: () => {
      setError(null);
      resetShortcut(action.id);
    },
  };
}
