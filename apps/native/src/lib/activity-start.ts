import { useEffect, useState, useSyncExternalStore } from "react";
import { AppState, Platform } from "react-native";

import { activitiesEnabled } from "../../modules/live-activities";
import { type StartTokenState, startTokenChanged, startTokenField } from "./activity-tokens";

// The switch of an iPhone's Live Activities, in the row "On this device", and the token iOS gives
// the app to start one by a push: decision 074. The switch is off until the account turns it on
// there, and goes off with push. While it is on, the device of decision 072 gives the token with
// `push.registerApp` and `push.renewApp`, again when iOS changes it, and takes it back when the
// switch or the system's own for the app's Live Activities goes off, which the app reads each
// time it comes to the foreground. The phone keeps the switch, the token iOS gave last and what
// the device said last, in the localStorage that expo-sqlite gives the app.

const ON = "tonnr:activities";
const TOKEN = "tonnr:activities-token";
const SAID = "tonnr:activities-said";

const listeners = new Set<() => void>();
const told = () => {
  for (const listener of listeners) listener();
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const kept = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const keep = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // The switch then lasts until the app is closed.
  }
};

/** Whether the account turned the iPhone's Live Activities on here. */
export const activitiesSwitchedOn = () => kept(ON) === "on";

/** The switch, for a screen that is drawn again when it moves. */
export const useActivitiesSwitch = () =>
  useSyncExternalStore(subscribe, activitiesSwitchedOn, () => false);

/**
 * The system's own switch for the app's Live Activities, which its person changes in Settings
 * while the app is away: read again each time the app comes back to the foreground.
 */
export function useSystemActivities() {
  const [isOn, setOn] = useState(activitiesEnabled);
  useEffect(() => {
    const watching = AppState.addEventListener("change", (state) => {
      if (state === "active") setOn(activitiesEnabled());
    });
    return () => watching.remove();
  }, []);
  return isOn;
}

/** Turns the switch on or off. The device says it at its next renewal, which the caller asks. */
export function setActivitiesSwitch(on: boolean) {
  keep(ON, on ? "on" : null);
  told();
}

/** Keeps the token iOS gave the app to start a Live Activity. */
export function keepStartToken(token: string) {
  keep(TOKEN, token);
}

/** What the phone knows of the token now: the switch, the system's switch and the token. */
export function startTokenState(): StartTokenState {
  return {
    isOn: activitiesSwitchedOn(),
    systemOn: Platform.OS === "ios" ? activitiesEnabled() : false,
    token: kept(TOKEN) ?? undefined,
  };
}

/** What the device says of the token as it is given or said again: see `startTokenField`. */
export const startTokenNow = () => startTokenField(startTokenState());

/** Keeps what the device said of the token, once the API took it: an Android phone says none. */
export function saidStartToken(device: object) {
  if (!("activityStartToken" in device)) return;
  const said = device.activityStartToken;
  if (typeof said === "string" || said === null) keep(SAID, said ?? "");
}

/** Whether the device should say the token again: iOS changed it, or a switch moved. */
export function startTokenToSay() {
  const said = kept(SAID);
  return startTokenChanged(startTokenState(), said === null ? undefined : said || null);
}

/** Forgets the switch and the token, as switching push off or signing out does. */
export function forgetActivityStart() {
  keep(ON, null);
  keep(TOKEN, null);
  keep(SAID, null);
  told();
}
