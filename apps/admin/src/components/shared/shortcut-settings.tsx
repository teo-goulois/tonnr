import { Button } from "@repo/ui/components/ui/button";
import { Dialog, DialogDescription, DialogPopup, DialogTitle } from "@repo/ui/components/ui/dialog";
import { useEffect, useSyncExternalStore } from "react";

import {
  SHORTCUT_ACTIONS,
  isDefaultShortcut,
  useShortcutRecorder,
  useShortcuts,
  type ShortcutAction,
  type ShortcutBindings,
} from "@/lib/shortcuts";
import { m } from "@/paraglide/messages.js";

import { ShortcutKeys } from "./shortcut-keys";

// A module-level store, so that the command palette can open the dialog from anywhere.
let isOpen = false;
const listeners = new Set<() => void>();

function setOpen(next: boolean) {
  isOpen = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function openShortcutSettings() {
  setOpen(true);
}

function ShortcutRow({ action, bindings }: { action: ShortcutAction; bindings: ShortcutBindings }) {
  const hotkey = bindings[action.id];
  const recorder = useShortcutRecorder(action, bindings);

  return (
    <li className="grid gap-xxs">
      <div className="flex items-center justify-between gap-s">
        <span>{action.label()}</span>
        <span className="flex items-center gap-xxs">
          {isDefaultShortcut(action, hotkey) ? null : (
            <Button variant="ghost" size="sm" onClick={recorder.reset}>
              {m.shortcuts_reset()}
            </Button>
          )}
          <Button
            variant={recorder.isRecording ? "secondary" : "outline"}
            size="sm"
            aria-pressed={recorder.isRecording}
            onClick={recorder.toggle}
          >
            {recorder.isRecording ? (
              m.shortcuts_recording()
            ) : hotkey === "" ? (
              m.shortcuts_off()
            ) : (
              <ShortcutKeys hotkey={hotkey} />
            )}
          </Button>
        </span>
      </div>
      {recorder.error ? (
        <p role="alert" className="text-s text-error">
          {recorder.error}
        </p>
      ) : null}
    </li>
  );
}

// The dialog where the operator rebinds every shortcut of the admin. They belong to this
// browser: the copy an account keeps is of the web app's shortcuts, which are other ones.
export function ShortcutSettings() {
  const open = useSyncExternalStore(
    subscribe,
    () => isOpen,
    () => false,
  );
  const bindings = useShortcuts();
  // The dialog does not stay open for whoever signs in next.
  useEffect(() => () => setOpen(false), []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogPopup className="w-full max-w-md gap-l p-l">
        <div className="grid gap-xs">
          <DialogTitle>{m.shortcuts_title()}</DialogTitle>
          <DialogDescription>{m.shortcuts_description()}</DialogDescription>
        </div>
        <ul className="grid gap-s">
          {SHORTCUT_ACTIONS.map((action) => (
            <ShortcutRow key={action.id} action={action} bindings={bindings} />
          ))}
        </ul>
      </DialogPopup>
    </Dialog>
  );
}
