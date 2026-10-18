// PROTOTYPE, throwaway: which variant the alert sheet shows. `?proto=a|b|c|d` on any address
// turns the prototype on for the tab and picks the tide variant, `&or=1|2` the way "ou" is
// shown, and `?proto=off` turns it off. The router drops a parameter it does not know at its next
// navigation, so the choice is kept in the tab's session storage, and the bar in the sheet
// changes it from there.

import { useSyncExternalStore } from "react";

import type { OrVariant, TideVariant } from "./rules";

export type ProtoChoice = {
  on: boolean;
  // "current" shows the editor that is on main, to compare.
  editor: "proto" | "current";
  tide: TideVariant;
  or: OrVariant;
};

const KEY = "tonnr-prototype-alert-conditions";
const OFF: ProtoChoice = { on: false, editor: "proto", tide: "a", or: "1" };

function readInitial(): ProtoChoice {
  if (typeof window === "undefined") return OFF;
  const params = new URLSearchParams(window.location.search);
  const kept = (() => {
    try {
      return JSON.parse(sessionStorage.getItem(KEY) ?? "null") as ProtoChoice | null;
    } catch {
      return null;
    }
  })();
  const proto = params.get("proto");
  if (proto === "off") {
    sessionStorage.removeItem(KEY);
    return OFF;
  }
  const choice: ProtoChoice = { ...OFF, ...kept };
  if (proto) {
    choice.on = true;
    if (["a", "b", "c", "d"].includes(proto)) choice.tide = proto as TideVariant;
  }
  const or = params.get("or");
  if (or === "1" || or === "2" || or === "3") choice.or = or;
  if (choice.on) sessionStorage.setItem(KEY, JSON.stringify(choice));
  return choice;
}

let choice: ProtoChoice = readInitial();
const listeners = new Set<() => void>();

export function setProto(next: Partial<ProtoChoice>) {
  choice = { ...choice, ...next };
  sessionStorage.setItem(KEY, JSON.stringify(choice));
  for (const listener of listeners) listener();
}

export function useProto() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => choice,
    () => OFF,
  );
}
