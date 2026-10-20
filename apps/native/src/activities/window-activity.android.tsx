// On Android a window that begins stays decision 072's push, posted by the app's service on the
// channel `begins` and gone by itself when the window ends: Google allows no alert as a Live
// Update (decision 074). There is nothing to follow here; the iPhone's is window-activity.tsx.

/** Nothing to follow on Android. */
export function useWindowActivities() {}

/** Nothing runs on Android to end. */
export async function endWindowActivitiesOf(_alertId: string) {}

/** Nothing is kept on Android to forget. */
export async function forgetWindowActivities() {}
