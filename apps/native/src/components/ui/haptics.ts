import {
  AndroidHaptics,
  impactAsync,
  ImpactFeedbackStyle,
  NotificationFeedbackType,
  notificationAsync,
  performAndroidHapticsAsync,
  selectionAsync,
} from "expo-haptics";
import { Platform } from "react-native";

// What a touch feels like, in the few places a native app gives one: a choice that moves, a
// switch, a press held, and what an action came to. Android plays its own constants, which keep
// to the phone's setting of touch feedback; iOS plays its generators. A phone that has none says
// nothing, and nothing waits on it.

export type Feel =
  /** A choice among a few moved: a segment, a chip. */
  | "select"
  /** A switch was turned on or off. */
  | "toggle-on"
  | "toggle-off"
  /** A press was held long enough to do something. */
  | "hold"
  /** What was asked was done, or was refused. */
  | "done"
  | "failed"
  /** Something asks to be read before going on: a question that would lose what was written. */
  | "warn";

const ANDROID: Record<Feel, AndroidHaptics> = {
  select: AndroidHaptics.Segment_Tick,
  "toggle-on": AndroidHaptics.Toggle_On,
  "toggle-off": AndroidHaptics.Toggle_Off,
  hold: AndroidHaptics.Long_Press,
  done: AndroidHaptics.Confirm,
  failed: AndroidHaptics.Reject,
  warn: AndroidHaptics.Reject,
};

function playOnIos(feel: Feel): Promise<void> {
  switch (feel) {
    case "select":
    case "toggle-on":
    case "toggle-off":
      return selectionAsync();
    case "hold":
      return impactAsync(ImpactFeedbackStyle.Medium);
    case "done":
      return notificationAsync(NotificationFeedbackType.Success);
    case "failed":
      return notificationAsync(NotificationFeedbackType.Error);
    case "warn":
      return notificationAsync(NotificationFeedbackType.Warning);
  }
}

/** Plays a feel, and forgets it: a phone that cannot play it plays nothing. */
export function feel(what: Feel) {
  const played =
    Platform.OS === "android"
      ? performAndroidHapticsAsync(ANDROID[what])
      : Platform.OS === "ios"
        ? playOnIos(what)
        : Promise.resolve();
  played.catch(() => {});
}
