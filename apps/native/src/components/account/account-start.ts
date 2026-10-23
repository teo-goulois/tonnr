import { activeDayKey, utcDay } from "@repo/client/analytics";
import { useQueryClient } from "@tanstack/react-query";
import { router, useGlobalSearchParams, usePathname } from "expo-router";
import { useEffect, useRef } from "react";
import { AppState } from "react-native";

import { isTabPath } from "@/components/profile/profiling";
import { useOnboardingOnce } from "@/components/profile/use-profile";
import { useLiveSessionOffer } from "@/components/sessions/use-live-offer";
import { useAccount } from "@/lib/account";
import {
  analyticsConfigured,
  analyticsEnvironment,
  identifyAnalytics,
  startAnalytics,
  stopAnalytics,
  trackFeature,
  watchErrors,
} from "@/lib/analytics";
import { screenFeatureOf } from "@/lib/analytics-screen";
import { client } from "@/utils/orpc";

import { useKeptSettings } from "./kept-settings";
import { forgetOnPhone } from "./leave";
import { useComeBackAfterRestart } from "./restart";
import { readConsent, setInstanceErrorReports, useConsent, useErrorReports } from "./use-consent";

/**
 * Forgets what the phone kept for an account once it learns that the account is no longer the
 * one signed in here: signed out elsewhere, its session closed by an operator or by a new
 * password, or another account signed in. Decision 070.
 */
function useForgetWhenLeft() {
  const { userId, pending } = useAccount();
  const queryClient = useQueryClient();
  const last = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (pending) return;
    if (last.current !== undefined && last.current !== userId) forgetOnPhone(queryClient);
    last.current = userId;
  }, [userId, pending, queryClient]);
}

/**
 * Asks the one question about analytics and error reports once in a run of the app, as the web
 * asks it over the map: while no choice is kept, in a build that names a project, once a tab's
 * own screen is in view with nothing over it. Decisions 044 and 054.
 */
function useConsentOnce() {
  const consent = useConsent();
  const free = isTabPath(usePathname());
  const asked = useRef(false);
  useEffect(() => {
    if (!analyticsConfigured || consent !== null || !free || asked.current) return;
    asked.current = true;
    router.push("/consent");
  }, [consent, free]);
}

/**
 * The product's analytics as the app runs, with the person's yes in a build that names a
 * project, as the web's `Analytics` does: who uses the app, by the account's id alone, the first
 * use of each day in UTC, which the API records as `app_active`, the instance's word on the error
 * reports, the errors no code caught, and the screen in view. A refusal stops them and forgets the
 * ids. Decisions 044, 054 and 069.
 */
function useAnalytics() {
  const consent = useConsent();
  const errorReports = useErrorReports();
  const { userId, pending } = useAccount();
  const feature = screenFeatureOf(usePathname(), useGlobalSearchParams());

  useEffect(() => {
    if (!analyticsConfigured || pending) return;
    if (consent !== "granted") {
      stopAnalytics();
      return;
    }
    let cancelled = false;
    let day = "";
    let recording = false;
    // The first use of the day, while the app is on the screen: as it starts, as it comes back,
    // and past midnight for an app left open.
    const active = async () => {
      if (cancelled || recording || AppState.currentState !== "active") return;
      if (readConsent() !== "granted") return;
      const today = utcDay();
      if (today === day) return;
      // The call carries the SDK's ids, without which the API records nothing: it waits for them.
      const posthog = await startAnalytics();
      const id = userId ?? posthog?.getDistinctId();
      if (!posthog || !id || cancelled || readConsent() !== "granted") return;
      const key = activeDayKey(analyticsEnvironment, id);
      try {
        if (localStorage.getItem(key) === today) {
          day = today;
          return;
        }
      } catch {
        // The API counts the day once all the same.
      }
      recording = true;
      try {
        await client.v1.activity.record();
        day = today;
        try {
          localStorage.setItem(key, today);
        } catch {
          // Remembered for this run of the app.
        }
      } catch {
        // Asked again at the next use.
      } finally {
        recording = false;
      }
    };
    void startAnalytics().then((posthog) => {
      if (!posthog || cancelled) return;
      identifyAnalytics(userId);
      void active();
    });
    const listening = AppState.addEventListener("change", (state) => {
      if (state === "active") void active();
    });
    const timer = setInterval(() => void active(), 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
      listening.remove();
    };
  }, [consent, userId, pending]);

  // An operator may turn the error reports off for every device: the app asks once a run, for a
  // person who accepted them, and sends until the answer says off. Decision 054.
  useEffect(() => {
    if (!analyticsConfigured || consent !== "granted") return;
    let cancelled = false;
    client.v1.errorReports
      .get()
      .then(({ on }) => {
        if (!cancelled) setInstanceErrorReports(on);
      })
      .catch(() => {
        // An API that does not answer leaves them as they were.
      });
    return () => {
      cancelled = true;
    };
  }, [consent]);

  useEffect(() => {
    if (!analyticsConfigured || !errorReports) return;
    return watchErrors();
  }, [errorReports]);

  useEffect(() => {
    if (!analyticsConfigured || consent !== "granted" || feature === null) return;
    let cancelled = false;
    void startAnalytics().then((posthog) => {
      if (!posthog || cancelled) return;
      const [name = "map", tab, kind] = feature.split(":");
      trackFeature(name, tab, kind);
    });
    return () => {
      cancelled = true;
    };
  }, [consent, feature]);
}

/**
 * What the app does with the account as it runs, whatever screen is open: the units and the
 * density in force, the phone's kept things forgotten when the account leaves, the question about
 * analytics and the questions of decision 063 asked once, the analytics themselves once they are
 * said yes to, a session that was timed and not written offered once (decision 074), and the
 * account's tab opened again after a change of language started the app again. The tabs mount
 * it; it draws nothing.
 */
export function useAccountStart() {
  useKeptSettings();
  useForgetWhenLeft();
  useComeBackAfterRestart();
  useConsentOnce();
  useAnalytics();
  useOnboardingOnce();
  useLiveSessionOffer();
}
