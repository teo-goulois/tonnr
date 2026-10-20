import * as Notifications from "expo-notifications";

import {
  hideSessionNotice,
  sessionNoticeShown,
  showSessionNotice,
} from "../../modules/live-activities";
import { LIVE_ROUTE, type SessionShown } from "./session-shown";

// The session in progress on Android: an ongoing notification on the channel `sessions`, with a
// chronometer from the start and an action that ends it, which asks Android 16 to promote it as a
// Live Update (decision 074). Neither expo-notifications nor expo-widgets makes one, so the app's
// module does, in modules/live-activities. The iPhone's is a Live Activity (session-activity.tsx).

/**
 * Shows the session in progress in the notifications. The system is asked whether the app may
 * notify the first time a session is timed, if it was never asked: the person has just started
 * one. False where it may not.
 */
export async function showSession(shown: SessionShown) {
  try {
    const settings = await Notifications.getPermissionsAsync();
    const allowed =
      settings.granted ||
      (settings.canAskAgain && (await Notifications.requestPermissionsAsync()).granted);
    if (!allowed) return false;
    return await post(shown);
  } catch {
    return false;
  }
}

/** Posts the notification again in its place, with what it says anew. */
export async function updateSession(shown: SessionShown) {
  await post(shown).catch(() => false);
}

const post = (shown: SessionShown) =>
  showSessionNotice({
    title: shown.place,
    // A notification's text draws no picture: the wind's arrow is one of text there.
    text: [shown.since, ...shown.lines, ...(shown.wind ? [shown.wind.text] : [])].join(" · "),
    startedAt: shown.startedAt,
    endsBy: shown.endsBy,
    endLabel: shown.end,
    openPath: LIVE_ROUTE,
    endPath: `${LIVE_ROUTE}?end=1`,
  });

/** Takes the notification away, as the session ends or is forgotten. */
export async function hideSession() {
  await hideSessionNotice().catch(() => {});
}

/** Whether the notification is still shown: its person may have swiped it away. */
export async function sessionShownNow(): Promise<boolean | undefined> {
  return sessionNoticeShown().catch(() => undefined);
}
