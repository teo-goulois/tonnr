// What an iPhone tells the API of its Live Activities, decision 074: the token iOS gives the app
// to start one by a push, while the switch of the row "On this device" and the system's own
// switch for the app's Live Activities are both on, and the token of each activity the worker
// started, until it ends. These rules read no phone and no storage: the hook that follows the
// activities gives them what it read.

/** What the phone knows of the token that starts its Live Activities. */
export type StartTokenState = {
  // The switch of the app, which is off until the account turns it on.
  isOn: boolean;
  // The system's own switch for the app's Live Activities, undefined while it was not read.
  systemOn: boolean | undefined;
  // What iOS gave last, undefined while it gave nothing.
  token: string | undefined;
};

/**
 * What a device says of the token as `push.registerApp` and `push.renewApp` give it: the token
 * while both switches are on, null to take it back while either is off, and nothing, which keeps
 * what the API holds, while the phone cannot tell.
 */
export function startTokenField(
  state: StartTokenState,
): { activityStartToken: string | null } | Record<string, never> {
  if (!state.isOn || state.systemOn === false) return { activityStartToken: null };
  if (state.systemOn === undefined || state.token === undefined) return {};
  return { activityStartToken: state.token };
}

/** Whether what the device would say of the token differs from what it said last. */
export function startTokenChanged(state: StartTokenState, said: string | null | undefined) {
  const field = startTokenField(state);
  return "activityStartToken" in field && field.activityStartToken !== said;
}

/** An activity of a window that iOS runs on the phone, as the app reads it. */
export type RunningActivity = { id: string; notificationId: string | null; token: string | null };

/** What the phone kept of an activity it gave the API, by the id ActivityKit gives it. */
export type FollowedActivity = { notificationId: string; token: string };

/**
 * What to tell the API of the window activities: the token of each that runs and whose token the
 * API was not given, or not that one; and the end of each it was given that no longer runs,
 * because its person dismissed it, iOS ended it or the app did.
 */
export function activityChanges(
  followed: Readonly<Record<string, FollowedActivity>>,
  running: readonly RunningActivity[],
) {
  const started: { id: string; notificationId: string; token: string }[] = [];
  for (const activity of running) {
    if (!activity.notificationId || !activity.token) continue;
    if (followed[activity.id]?.token === activity.token) continue;
    started.push({
      id: activity.id,
      notificationId: activity.notificationId,
      token: activity.token,
    });
  }
  const runs = new Set(running.map((activity) => activity.id));
  const ended = Object.entries(followed)
    .filter(([id]) => !runs.has(id))
    .map(([id, activity]) => ({ id, notificationId: activity.notificationId }));
  return { started, ended };
}

/** The notification an activity's properties name, as the worker's pushes write them. */
export function notificationOf(props: string | null | undefined) {
  try {
    const read: unknown = JSON.parse(props ?? "null");
    const id = (read as { notificationId?: unknown } | null)?.notificationId;
    return typeof id === "string" && id !== "" ? id : null;
  } catch {
    return null;
  }
}
