// What the app keeps and reads, as the system may wake it with no screen drawn: the localStorage
// that holds the units, and the language it was set to.
import "expo-sqlite/localStorage/install";
import "@/lib/i18n";

import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";

import { setUnits, storedUnits } from "@/lib/units";

import { HAS_WIDGETS, refreshWidgets } from "./write";

// The task the app asks the system to run every hour, which writes the widgets again from one
// call of `places.now`: decision 074. The system runs it when it chooses, on iOS a few times a
// day. It is defined as the bundle loads, before the router, since the system may wake the app
// for it with no screen drawn (`index.ts`), and asked for while an account is signed in.

export const WIDGETS_TASK = "refresh-widgets";

/** The hour between two runs the app asks for: at least, which the system stretches as it likes. */
const EVERY_MINUTES = 60;

TaskManager.defineTask(WIDGETS_TASK, async () => {
  try {
    // The units the account chose, which no screen has put in force when the app is woken.
    const units = storedUnits();
    if (units) setUnits(units);
    await refreshWidgets();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/** Asks the system to run the task every hour, once: while an account is signed in. */
export async function askForWidgetTask() {
  if (!HAS_WIDGETS) return;
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status !== BackgroundTask.BackgroundTaskStatus.Available) return;
    if (await TaskManager.isTaskRegisteredAsync(WIDGETS_TASK)) return;
    await BackgroundTask.registerTaskAsync(WIDGETS_TASK, { minimumInterval: EVERY_MINUTES });
  } catch {
    // A phone that refuses background work still writes the widgets whenever the app runs.
  }
}

/** Stops the task: no account is signed in, and the widgets say so until one is. */
export async function stopWidgetTask() {
  if (!HAS_WIDGETS) return;
  try {
    if (await TaskManager.isTaskRegisteredAsync(WIDGETS_TASK)) {
      await BackgroundTask.unregisterTaskAsync(WIDGETS_TASK);
    }
  } catch {
    // Nothing was asked: there is nothing to stop.
  }
}
