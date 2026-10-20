import { type EventSubscription, requireOptionalNativeModule } from "expo";

/** What the notification of a session in progress says on Android: decision 074. */
export type SessionNotice = {
  title: string;
  text: string;
  startedAt: number;
  endsBy: number;
  endLabel: string;
  openPath: string;
  endPath: string;
};

type NativeLiveActivities = {
  areEnabled(): boolean;
  startByPush(): boolean;
  startQuietly(name: string, props: string, url: string | null): string;
  running(name: string): { id: string; props?: string }[];
  showSession(notice: SessionNotice): Promise<boolean>;
  hideSession(): Promise<void>;
  isSessionShown(): Promise<boolean>;
  addListener(event: "onActivity", listener: (event: { id: string }) => void): EventSubscription;
};

// Optional, so that a build made before the module still runs the app's JavaScript, without them.
const native = requireOptionalNativeModule<NativeLiveActivities>("LiveActivities");

/** Whether the system lets the app show Live Activities: false on Android, and where unknown. */
export const activitiesEnabled = () => native?.areEnabled() ?? false;

/** Whether a push of Apple's can start a Live Activity on this phone: iOS 17.2 and later. */
export const startsByPush = () => native?.startByPush() ?? false;

/**
 * Starts a Live Activity of that name, drawn by expo-widgets' layout of that name, that asks
 * Apple for no token: its id. Throws where the system does not let the app, or where the build
 * has no module.
 */
export function startQuietly(name: string, props: string, url?: string) {
  if (!native) throw new Error("The module live-activities is not in this build");
  return native.startQuietly(name, props, url ?? null);
}

/** The Live Activities of that name that run, each with what it shows as a string of JSON. */
export const runningActivities = (name: string) => native?.running(name) ?? [];

/** Calls `listener` each time iOS starts an activity of the app, or one changes. */
export function onActivity(listener: () => void): EventSubscription {
  return native?.addListener("onActivity", listener) ?? { remove: () => {} };
}

/** Posts the notification of a session in progress on Android. False where it cannot be. */
export const showSessionNotice = async (notice: SessionNotice) =>
  (await native?.showSession(notice)) ?? false;

/** Takes the notification of a session in progress away. */
export const hideSessionNotice = async () => {
  await native?.hideSession();
};

/** Whether the notification of a session in progress is still shown, undefined where unknown. */
export const sessionNoticeShown = async () => (native ? native.isSessionShown() : undefined);
