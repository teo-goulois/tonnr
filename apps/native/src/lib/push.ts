import * as Application from "expo-application";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { Platform } from "react-native";

import { ENV } from "@/env";
import { m } from "@/paraglide/messages";
import { client } from "@/utils/orpc";

import { forgetPushKeys, pushKeys, setPushLabels } from "../../modules/push-keys";
import { forgetActivityStart, saidStartToken, startTokenNow } from "./activity-start";
import { type Route, destinationOfAddress } from "./links";

// The app's side of push: the channels and the categories in the app's language, the phone
// given to the API as a device of the account, its token said again at each start, and a press
// on a notification opened where it speaks of. Decision 072.

const ON = "tonnr:push";
const DEVICE = "tonnr:push-device";
const TOKEN = "tonnr:push-token";

/** Whether the person switched push on in this app, which a start says again to the API. */
export const pushIsOn = () => localStorage.getItem(ON) === "on";

/** The id the API gave this phone as a device, while push is on. */
export const pushDeviceId = () => localStorage.getItem(DEVICE);

/** What the system lets the app do: asked, granted, refused or not yet asked. */
export async function permission() {
  const settings = await Notifications.getPermissionsAsync();
  if (settings.granted) return "granted" as const;
  return settings.canAskAgain ? ("ask" as const) : ("refused" as const);
}

/**
 * The channels of decision 072 on Android, named in the app's language, and the actions of its
 * categories on both systems. Made as the app starts: a channel's importance is chosen once.
 */
export async function preparePush() {
  if (Platform.OS === "android") {
    const channel = (id: string, name: string, importance: Notifications.AndroidImportance) =>
      Notifications.setNotificationChannelAsync(id, { name, importance });
    await Promise.all([
      channel("alerts", m.native_channel_alerts(), Notifications.AndroidImportance.DEFAULT),
      channel("begins", m.native_channel_begins(), Notifications.AndroidImportance.HIGH),
      channel("evening", m.native_channel_evening(), Notifications.AndroidImportance.LOW),
      channel("reports", m.native_channel_reports(), Notifications.AndroidImportance.DEFAULT),
      channel("sessions", m.native_channel_sessions(), Notifications.AndroidImportance.LOW),
    ]);
  }
  await setPushLabels({
    standIn: m.native_push_stand_in(),
    notToday: m.native_push_not_today(),
    logSession: m.native_push_log_session(),
  });
  await Notifications.setNotificationCategoryAsync("today", [
    {
      identifier: "not-today",
      buttonTitle: m.native_push_not_today(),
      options: { opensAppToForeground: true },
    },
  ]);
  await Notifications.setNotificationCategoryAsync("begins", [
    {
      identifier: "log-session",
      buttonTitle: m.native_push_log_session(),
      options: { opensAppToForeground: true },
    },
  ]);
}

// The token the app last gave the API, kept on the phone. The system tells the token's listeners
// each time it is read, the app's own reads too: a token said already is not said again.
const given = () => localStorage.getItem(TOKEN);

/** Whether a token the system gives is one the app has not given the API yet. */
export const isNewToken = (token: Notifications.DevicePushToken) => String(token.data) !== given();

/**
 * The device as the API takes it: its token, its kind, its keys. `known` is a token the system
 * just gave, which is not read again. An Android emulator with Google Play's services is given a
 * token as a phone is, and one without them fails here.
 */
async function deviceOf(account: string, known?: string) {
  const token = known ?? String((await Notifications.getDevicePushTokenAsync()).data);
  localStorage.setItem(TOKEN, token);
  const keys = await pushKeys();
  const label = Device.modelName ?? undefined;
  const appId = Application.applicationId ?? "app.tonnr";
  if (Platform.OS === "ios") {
    // A build of the App Store or TestFlight carries no profile, which says no environment, and
    // goes through Apple's production host. A simulator's says none either, and its token is a
    // token of Apple's sandbox.
    const environment = await Application.getIosPushNotificationServiceEnvironmentAsync();
    const sandbox = environment === "development" || !Device.isDevice;
    return {
      kind: "ios" as const,
      token,
      environment: sandbox ? ("development" as const) : ("production" as const),
      appId,
      keys,
      label,
      account,
      // The token that starts its Live Activities while their switch is on, or null: decision 074.
      ...startTokenNow(),
    };
  }
  return { kind: "android" as const, token, appId, keys, label, account };
}

/**
 * Switches push on for this phone: asks the system, which a person answers once, then gives the
 * device to the API. Asked when the account saves its first alert or switches push on, never as
 * the app opens (decision 072). False when the system said no.
 */
export async function switchPushOn(account: string) {
  const asked = await Notifications.requestPermissionsAsync();
  if (!asked.granted) return false;
  const device = await deviceOf(account);
  const made = await client.v1.push.registerApp(device);
  localStorage.setItem(DEVICE, made.id);
  localStorage.setItem(ON, "on");
  saidStartToken(device);
  return true;
}

/**
 * Says the phone's token again, as each start does and when the system gives another one, which
 * is `known`.
 */
export async function renewPush(account: string, known?: string) {
  if (!pushIsOn() || (await permission()) !== "granted") return;
  const device = await deviceOf(account, known);
  const id = localStorage.getItem(DEVICE) ?? undefined;
  try {
    const renewed = await client.v1.push.renewApp({ ...device, ...(id && { id }) });
    localStorage.setItem(DEVICE, renewed.id);
  } catch {
    // A device the API no longer keeps is given again.
    const made = await client.v1.push.registerApp(device);
    localStorage.setItem(DEVICE, made.id);
  }
  saidStartToken(device);
}

/** Switches push off for this phone, as switching it off or signing out does (decision 070). */
export async function switchPushOff(account?: string) {
  const kept = given();
  localStorage.removeItem(ON);
  localStorage.removeItem(DEVICE);
  localStorage.removeItem(TOKEN);
  // Live Activities go off with push: their switch is on a device that is forgotten (decision 074).
  forgetActivityStart();
  try {
    const token = kept ?? String((await Notifications.getDevicePushTokenAsync()).data);
    await client.v1.push.forgetApp({
      kind: Platform.OS === "ios" ? "ios" : "android",
      token,
      ...(account && { account }),
    });
  } catch {
    // Signed out already, or no token: the API forgets the device with its session.
  }
  await forgetPushKeys();
}

/**
 * Opens what a pressed notification speaks of, or what one of its actions asks. On iOS, what the
 * app reads of a push is what the extension wrote under `body`, which expo-notifications gives
 * as its data; a push the extension could not open has none, and opens the app where it is.
 */
export function openNotification(response: Notifications.NotificationResponse) {
  const data = (response.notification.request.content.data ?? {}) as {
    url?: string;
    ids?: { alert?: string };
    pauseUntil?: string;
  };
  if (response.actionIdentifier === "not-today" && data.ids?.alert) {
    const until = data.pauseUntil ? `&until=${encodeURIComponent(data.pauseUntil)}` : "";
    return router.push(`/pause-alert?alert=${encodeURIComponent(data.ids.alert)}${until}` as Route);
  }
  if (!data.url) return;
  const destination = destinationOfAddress(data.url, ENV.EXPO_PUBLIC_SITE_URL);
  if (response.actionIdentifier === "log-session" && "route" in destination) {
    const place = /^\/place\/(break|spot)\/([^?]+)/.exec(destination.route);
    if (place) return router.push(`/session/new?place=${place[1]}:${place[2]}` as Route);
  }
  if ("route" in destination) router.push(destination.route);
}
