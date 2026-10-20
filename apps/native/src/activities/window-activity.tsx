import { HStack, Image, Link, ProgressView, Spacer, Text, VStack } from "@expo/ui/swift-ui";
import {
  font,
  foregroundStyle,
  lineLimit,
  monospacedDigit,
  opacity,
  padding,
  rotationEffect,
} from "@expo/ui/swift-ui/modifiers";
import { useQuery } from "@tanstack/react-query";
import {
  type LiveActivity,
  type LiveActivityComponent,
  type LiveActivityEnvironment,
  type LiveActivityFactory,
  addPushToStartTokenListener,
  createLiveActivity,
} from "expo-widgets";
import { useEffect } from "react";
import { AppState } from "react-native";

import { useAccount } from "@/lib/account";
import { activityChanges, type FollowedActivity, notificationOf } from "@/lib/activity-tokens";
import { keepStartToken, startTokenToSay, useActivitiesSwitch } from "@/lib/activity-start";
import { pushDeviceId, renewPush } from "@/lib/push";
import { useUnits } from "@/lib/units";
import { getLocale } from "@/paraglide/runtime";
import { client, orpc } from "@/utils/orpc";

import { onActivity, runningActivities, startsByPush } from "../../modules/live-activities";
import {
  WINDOW_ACTIVITY,
  type WindowKept,
  type WindowRead,
  type WindowShown,
  keptForWindow,
  layoutWith,
  readWindow,
} from "./window-reading";
import { windowWriting } from "./writing";

// The Live Activity of a window that begins, on an iPhone whose switch is on: decision 074. The
// worker starts it by a push in the place of "it is on", updates it and ends it; iOS draws it with
// the layout below, which the app writes with the names of the account's alerts, its units and
// its words, at each start and whenever they change. iOS wakes the app as it starts one: the app
// then gives the API the activity's token, again when iOS changes it, and says when one no longer
// runs, because its person dismissed it or the app ended it. Android tells "it is on" by its push
// (window-activity.android.tsx).

/**
 * The layout, which the build writes out as a string: it names nothing outside itself but the
 * components and modifiers of `@expo/ui/swift-ui`, and is given the reading of a push and what
 * the app wrote beside it by `layoutWith`.
 */
function WindowActivity(
  props: WindowShown,
  environment: LiveActivityEnvironment,
  read: (shown: WindowShown, kept: WindowKept) => WindowRead,
  kept: WindowKept,
) {
  "widget";
  const said = read(props, kept);
  const muted = foregroundStyle({ type: "hierarchical", style: "secondary" });
  const small = font({ textStyle: "footnote" });
  const faded = opacity(environment.isStale ? 0.5 : 1);
  const range = { lower: new Date(said.start), upper: new Date(said.end) };
  const until = (
    <HStack spacing={4}>
      <Text modifiers={[small, muted]}>{kept.words.until}</Text>
      <Text date={new Date(said.end)} dateStyle="time" modifiers={[small, muted]} />
    </HStack>
  );
  const name =
    said.title === null ? null : (
      <Text modifiers={[font({ textStyle: "headline" }), lineLimit(1)]}>{said.title}</Text>
    );
  const where =
    said.place === null && said.more === null ? null : (
      <Text modifiers={[small, muted, lineLimit(1)]}>
        {said.place !== null && said.more !== null
          ? `${said.place} ${said.more}`
          : (said.place ?? said.more ?? "")}
      </Text>
    );
  const sea =
    said.sea === null ? null : (
      <HStack spacing={4}>
        {said.seaToward === null ? null : (
          <Image systemName="arrow.up" size={12} modifiers={[rotationEffect(said.seaToward)]} />
        )}
        <Text modifiers={[font({ weight: "semibold" }), monospacedDigit()]}>{said.sea}</Text>
      </HStack>
    );
  const wind =
    said.wind === null ? null : <Text modifiers={[small, lineLimit(1)]}>{said.wind}</Text>;
  const tide =
    said.tide === null ? null : (
      <HStack spacing={4}>
        <Text modifiers={[small, muted]}>{said.tide.word}</Text>
        <Text date={new Date(said.tide.at)} dateStyle="time" modifiers={[small]} />
        {said.tide.height === null ? null : (
          <Text modifiers={[small, muted]}>{said.tide.height}</Text>
        )}
      </HStack>
    );
  const buoy =
    said.buoy === null ? null : (
      <HStack spacing={4}>
        <Text modifiers={[small, muted, lineLimit(1)]}>{said.buoy.text}</Text>
        <Text date={new Date(said.buoy.at)} dateStyle="relative" modifiers={[small, muted]} />
      </HStack>
    );
  const links = (
    <HStack spacing={12}>
      <Link destination={said.session} label={kept.words.logSession} />
      <Spacer />
      <Link destination={said.pause} label={kept.words.notToday} />
    </HStack>
  );
  return {
    banner: (
      <VStack alignment="leading" spacing={6} modifiers={[padding({ all: 16 }), faded]}>
        <HStack spacing={8}>
          {name}
          <Spacer />
          {until}
        </HStack>
        {where}
        <ProgressView timerInterval={range} countsDown={false} />
        <HStack spacing={12}>
          {sea}
          {wind}
        </HStack>
        <HStack spacing={12}>
          {tide}
          {buoy}
        </HStack>
        {links}
      </VStack>
    ),
    compactLeading: <Image systemName="water.waves" size={16} />,
    compactTrailing:
      said.height === null ? (
        <Text date={new Date(said.end)} dateStyle="time" modifiers={[monospacedDigit()]} />
      ) : (
        <Text modifiers={[monospacedDigit()]}>{said.height}</Text>
      ),
    minimal: <Image systemName="water.waves" size={16} />,
    expandedLeading: name ?? <Image systemName="water.waves" size={20} />,
    expandedTrailing: until,
    expandedBottom: (
      <VStack alignment="leading" spacing={4}>
        {where}
        <ProgressView timerInterval={range} countsDown={false} />
        <HStack spacing={12}>
          {sea}
          {wind}
        </HStack>
        {tide}
        {links}
      </VStack>
    ),
  };
}

// What the app keeps on the phone: the names it last wrote into the layout, and the activities
// whose token the API was given.
const NAMES = "tonnr:window-names";
const FOLLOWED = "tonnr:window-activities";

function keptJson<Value>(key: string, otherwise: Value): Value {
  try {
    const read: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
    return read && typeof read === "object" ? (read as Value) : otherwise;
  } catch {
    return otherwise;
  }
}
function keepJson(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Kept until the app is closed.
  }
}

let factory: LiveActivityFactory<WindowShown> | null = null;
let written: string | null = null;

/**
 * Writes the layout with the names of the alerts, the account's units and the app's words, and
 * makes the factory iOS draws the activities with: again only when what it holds changed.
 */
function writeLayout(names: WindowKept["alerts"]) {
  const kept: WindowKept = { ...keptForWindow([], windowWriting()), alerts: names };
  const layout = layoutWith(WindowActivity, readWindow, kept);
  if (factory && layout === written) return factory;
  written = layout;
  // The build wrote both functions out as strings: the layout is one string that holds them.
  factory = createLiveActivity(
    WINDOW_ACTIVITY,
    layout as unknown as LiveActivityComponent<WindowShown>,
  );
  return factory;
}

const instancesOf = () => {
  try {
    return (factory ?? writeLayout(keptJson(NAMES, {}))).getInstances();
  } catch {
    return [] as LiveActivity<WindowShown>[];
  }
};

// The API's answer for an iPhone or an activity it does not know as the caller's.
const isGone = (error: unknown) =>
  typeof error === "object" && error !== null && (error as { code?: unknown }).code === "NOT_FOUND";

// One pass at a time: iOS may tell of several activities at once.
let passing: Promise<void> = Promise.resolve();
const listening = new Map<string, { remove: () => void }>();

/**
 * Gives the API the token of each activity that runs and whose token it does not hold, and says
 * that those it was given and that no longer run ended. An activity the API says is over is ended
 * on the phone.
 */
function follow(account: string) {
  passing = passing.then(async () => {
    const device = pushDeviceId();
    if (!device) return;
    const instances = instancesOf();
    const shows = new Map(
      runningActivities(WINDOW_ACTIVITY).map((one) => [one.id, notificationOf(one.props)]),
    );
    const running = await Promise.all(
      instances.map(async (instance) => {
        const id = instance.getId();
        if (!listening.has(id)) {
          listening.set(
            id,
            instance.addPushTokenListener(() => follow(account)),
          );
        }
        const token = await instance.getPushToken().catch(() => null);
        return { id, notificationId: shows.get(id) ?? null, token };
      }),
    );
    const followed = keptJson<Record<string, FollowedActivity>>(FOLLOWED, {});
    const { started, ended } = activityChanges(followed, running);
    for (const activity of started) {
      try {
        const answer = await client.v1.push.activityStarted({
          id: device,
          notification: activity.notificationId,
          token: activity.token,
          account,
        });
        if (!answer.running) {
          await instances.find((one) => one.getId() === activity.id)?.end("immediate");
        }
      } catch (error) {
        // An activity the API does not know as the caller's is not given again: the worker ends
        // it. Any other failure is tried again at the next pass.
        if (!isGone(error)) continue;
      }
      followed[activity.id] = { notificationId: activity.notificationId, token: activity.token };
    }
    for (const activity of ended) {
      try {
        await client.v1.push.activityEnded({
          id: device,
          notification: activity.notificationId,
          account,
        });
      } catch (error) {
        if (!isGone(error)) continue;
      }
      delete followed[activity.id];
      listening.get(activity.id)?.remove();
      listening.delete(activity.id);
    }
    keepJson(FOLLOWED, followed);
  });
  return passing;
}

/**
 * What the app does of the window's Live Activities wherever it is, on an iPhone whose switch is
 * on: the layout written with the names of the account's alerts, the token that starts one given
 * again when iOS changes it or a switch moves, and the token of each activity iOS starts, which
 * iOS wakes the app to give.
 */
export function useWindowActivities() {
  const { userId } = useAccount();
  const isOn = useActivitiesSwitch() && startsByPush();
  const units = useUnits();
  const locale = getLocale();
  const alerts = useQuery({
    ...orpc.v1.alerts.list.queryOptions({ meta: { quiet: true } }),
    enabled: userId !== undefined && isOn,
  });

  // The layout, with what the app knows of the alerts, kept for the next start.
  useEffect(() => {
    if (!isOn) return;
    const names = alerts.data
      ? keptForWindow(alerts.data.alerts, windowWriting()).alerts
      : keptJson<WindowKept["alerts"]>(NAMES, {});
    if (alerts.data) keepJson(NAMES, names);
    writeLayout(names);
  }, [isOn, alerts.data, units, locale]);

  // The token that starts an activity, as iOS gives it, and the system's switch at each return.
  useEffect(() => {
    if (!userId) return;
    const sayAgain = () => {
      if (startTokenToSay()) void renewPush(userId).catch(() => {});
    };
    sayAgain();
    const returning = AppState.addEventListener("change", (state) => {
      if (state === "active") sayAgain();
    });
    const given = isOn
      ? addPushToStartTokenListener(({ activityPushToStartToken }) => {
          keepStartToken(activityPushToStartToken);
          sayAgain();
        })
      : null;
    return () => {
      returning.remove();
      given?.remove();
    };
  }, [userId, isOn]);

  // The activities iOS starts, and those that end.
  useEffect(() => {
    if (!userId) return;
    void follow(userId);
    const started = onActivity(() => void follow(userId));
    const returning = AppState.addEventListener("change", (state) => {
      if (state === "active") void follow(userId);
    });
    return () => {
      started.remove();
      returning.remove();
    };
  }, [userId]);
}

/** Ends on the phone the activities of an alert that was paused for the day: decision 072. */
export async function endWindowActivitiesOf(alertId: string) {
  const ofAlert = new Set(
    runningActivities(WINDOW_ACTIVITY)
      .filter((one) => {
        try {
          return (
            (JSON.parse(one.props ?? "null") as { alertId?: unknown } | null)?.alertId === alertId
          );
        } catch {
          return false;
        }
      })
      .map((one) => one.id),
  );
  for (const instance of instancesOf()) {
    if (ofAlert.has(instance.getId())) await instance.end("immediate").catch(() => {});
  }
}

/**
 * Forgets what the phone kept for the window's activities, as the account leaves it: the names
 * leave the layout, and the activities that run end on the phone. The worker ends them too.
 */
export async function forgetWindowActivities() {
  keepJson(NAMES, null);
  keepJson(FOLLOWED, null);
  for (const subscription of listening.values()) subscription.remove();
  listening.clear();
  for (const instance of instancesOf()) await instance.end("immediate").catch(() => {});
  if (factory) writeLayout({});
}
