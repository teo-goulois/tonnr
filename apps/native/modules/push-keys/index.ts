import { requireNativeModule } from "expo";

/** The phone's two keys for push, as a browser gives them: base64url, decision 072. */
export type PushKeys = { p256dh: string; auth: string };

/** The words the Android service writes with, which it cannot read from the app's messages. */
export type PushLabels = {
  standIn: string;
  notToday: string;
  logSession: string;
};

type NativePushKeys = {
  keys(): Promise<PushKeys>;
  forget(): Promise<void>;
  setLabels(labels: PushLabels): Promise<void>;
};

const native = requireNativeModule<NativePushKeys>("PushKeys");

/**
 * The phone's pair of keys of the curve P-256 and its secret of sixteen bytes, made the first time
 * push is switched on and kept where the part that opens a push reads them: the keychain's group
 * shared with the notification extension on iOS, under a key of the Keystore on Android. The
 * private key never leaves the phone. Decision 072.
 */
export const pushKeys = () => native.keys();

/** Deletes the keys, as signing out does (decision 070). */
export const forgetPushKeys = () => native.forget();

/** Gives the Android service the words it posts with, in the app's language. A no-op on iOS. */
export const setPushLabels = (labels: PushLabels) => native.setLabels(labels);
