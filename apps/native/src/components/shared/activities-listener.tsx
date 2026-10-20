import { useWindowActivities } from "@/activities/window-activity";

/**
 * What the app does of the Live Activities of the windows that begin wherever it is, on an
 * iPhone whose switch is on, even when iOS wakes it in the background to give the token of one
 * it started: decision 074. It draws nothing.
 */
export function ActivitiesListener() {
  useWindowActivities();
  return null;
}
