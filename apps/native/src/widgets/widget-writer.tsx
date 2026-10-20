import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { AppState } from "react-native";

import { useAccount } from "@/lib/account";
import { useUnits } from "@/lib/units";
import { orpc } from "@/utils/orpc";

import { askForWidgetTask, stopWidgetTask } from "./background";
import { widgetPlaces } from "./entries";
import {
  ASKED_AGAIN_AFTER_MS,
  HAS_WIDGETS,
  clearWidgets,
  refreshWidgets,
  rewriteWidgets,
} from "./write";

// The widgets are written while the app runs: as it starts and comes back to the foreground, when
// the account's saved places change, and when its units do (decision 074). The language changes
// as the app starts again in it. Signed out, the widgets say so, and the hourly task stops.

/** How long the saved places stay still before the widgets ask for them: a few saves in a row. */
const SETTLED_MS = 2000;

/** Writes the widgets whenever the app runs. The root layout mounts it; it draws nothing. */
export function WidgetWriter() {
  const { signedIn, pending, userId } = useAccount();
  const units = useUnits();
  const lists = useQuery(
    orpc.v1.lists.list.queryOptions({
      enabled: HAS_WIDGETS && signedIn,
      select: (answer) => answer.lists,
      meta: { quiet: true },
    }),
  );
  const places = lists.data ? JSON.stringify(widgetPlaces(lists.data)) : null;
  const latest = useRef(lists.data);
  useEffect(() => {
    latest.current = lists.data;
  }, [lists.data]);

  // Who is signed in: the task runs for an account, and a visitor's widgets say to sign in.
  useEffect(() => {
    if (!HAS_WIDGETS || pending) return;
    if (signedIn) {
      void askForWidgetTask();
    } else {
      clearWidgets();
      void stopWidgetTask();
    }
  }, [signedIn, pending, userId]);

  // The places the widgets read, once the account's lists have answered and stay still.
  useEffect(() => {
    if (!HAS_WIDGETS || !signedIn || places === null) return;
    const settled = setTimeout(
      () => void refreshWidgets({ lists: latest.current, unlessNewerThan: ASKED_AGAIN_AFTER_MS }),
      SETTLED_MS,
    );
    return () => clearTimeout(settled);
  }, [signedIn, userId, places]);

  // Back in the foreground, after a quarter of an hour at least.
  useEffect(() => {
    if (!HAS_WIDGETS || !signedIn) return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void refreshWidgets({ lists: latest.current, unlessNewerThan: ASKED_AGAIN_AFTER_MS });
      }
    });
    return () => subscription.remove();
  }, [signedIn]);

  // The units: the same answer, written again in them.
  useEffect(() => {
    if (HAS_WIDGETS) rewriteWidgets();
  }, [units]);

  return null;
}
