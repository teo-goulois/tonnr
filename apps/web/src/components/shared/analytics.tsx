import { Button } from "@repo/ui/components/ui/button";
import { Switch } from "@repo/ui/components/ui/switch";
import { Dialog, DialogDescription, DialogPopup, DialogTitle } from "@repo/ui/components/ui/dialog";
import { useEffect, useId, useRef, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";

import {
  analyticsConfigured,
  identifyAnalytics,
  startAnalytics,
  stopAnalytics,
  trackFeature,
  watchErrors,
} from "@/lib/analytics";
import {
  readAnalyticsConsent,
  setAnalyticsConsent,
  setErrorReports,
  setInstanceErrorReports,
  useAnalyticsConsent,
  useErrorReports,
  useInstanceErrorReports,
} from "@/lib/analytics-consent";
import { ENV } from "@/env.public";
import { m } from "@/paraglide/messages.js";
import { client } from "@/utils/orpc";

/** Mounted by the product and sign-in page: the landing can be rebuilt independently. */
export function Analytics({
  account,
  isReady = true,
  recordActivity = true,
}: {
  account: string | undefined;
  isReady?: boolean;
  recordActivity?: boolean;
}) {
  const consent = useAnalyticsConsent();
  const errorReports = useErrorReports();
  const feature = useRouterState({
    select: (state) => {
      const search = state.location.search as Record<string, unknown>;
      const allowed = (key: string, values: string[], otherwise: string) =>
        typeof search[key] === "string" && values.includes(search[key] as string)
          ? (search[key] as string)
          : otherwise;
      if (state.location.pathname === "/login") return "authentication:sign_in:";
      const panel = allowed("panel", ["saved", "alerts", "account"], "map");
      const settings = allowed("settings", ["alerts", "sessions", "friends", "contributions"], "");
      const tab = allowed("tab", ["guide", "sessions", "alerts"], "conditions");
      const kind = search.station ? "station" : search.break ? "break" : search.spot ? "spot" : "";
      return [settings || panel, tab, kind].join(":");
    },
  });
  useEffect(() => {
    if (!isReady) return;
    if (consent !== "granted") {
      stopAnalytics();
      return;
    }
    let cancelled = false;
    let day = "";
    let recording = false;
    const active = async () => {
      if (
        !recordActivity ||
        cancelled ||
        readAnalyticsConsent() !== "granted" ||
        document.visibilityState !== "visible" ||
        recording
      )
        return;
      const today = new Date().toISOString().slice(0, 10);
      if (today === day) return;
      const id = account ?? (await startAnalytics())?.get_distinct_id();
      if (!id || cancelled || readAnalyticsConsent() !== "granted") return;
      const key = `analytics-active:${ENV.VITE_POSTHOG_ENVIRONMENT}:${id}`;
      try {
        if (localStorage.getItem(key) === today) {
          day = today;
          return;
        }
      } catch {
        /* The server still deduplicates a browser that cannot store. */
      }
      recording = true;
      try {
        await client.v1.activity.record();
        day = today;
        try {
          localStorage.setItem(key, today);
        } catch {
          /* Remembered by this mounted app. */
        }
      } catch {
        /* Try on next visible use. */
      } finally {
        recording = false;
      }
    };
    void startAnalytics().then((posthog) => {
      if (!posthog || cancelled) return;
      identifyAnalytics(account);
      void active();
    });
    const visible = () => void active();
    document.addEventListener("visibilitychange", visible);
    // Handles midnight in a tab left open: no extra call within the same day.
    const timer = window.setInterval(visible, 60000);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [consent, account, isReady, recordActivity]);
  // An operator may turn the error reports off for every browser: the app asks once, for a
  // person who accepted them, and sends until the answer says off. Decision 054.
  useEffect(() => {
    if (!isReady || consent !== "granted") return;
    let cancelled = false;
    client.v1.errorReports
      .get()
      .then(({ on }) => !cancelled && setInstanceErrorReports(on))
      .catch(() => {
        /* An API that does not answer leaves them as they were. */
      });
    return () => {
      cancelled = true;
    };
  }, [consent, isReady]);
  // The same consent covers the error reports, on the same pages, unless the account tab turned
  // them off alone: decision 054.
  useEffect(() => {
    if (!isReady || !errorReports) return;
    return watchErrors();
  }, [errorReports, isReady]);
  useEffect(() => {
    if (!isReady || consent !== "granted") return;
    let cancelled = false;
    void startAnalytics().then(() => {
      if (cancelled) return;
      const [name, tab, kind] = feature.split(":");
      trackFeature(name!, tab, kind);
    });
    return () => {
      cancelled = true;
    };
  }, [consent, feature, isReady]);

  if (!analyticsConfigured) return null;
  // The app shown inside the landing asks nothing: whoever tries it there has not come to it yet.
  const isFramed = typeof window !== "undefined" && window.self !== window.top;
  return (
    <AnalyticsConsentDialog open={consent === null && !isFramed} onChoice={setAnalyticsConsent} />
  );
}

/** The consent presentation also appears in /design-system with no analytics transport. */
export function AnalyticsConsentDialog({
  open,
  onChoice,
}: {
  open: boolean;
  onChoice: (choice: "granted" | "denied") => void;
}) {
  const accept = useRef<HTMLButtonElement>(null);
  return (
    <Dialog
      open={open}
      onOpenChange={(shown) => {
        if (!shown) onChoice("denied");
      }}
    >
      <DialogPopup initialFocus={accept} className="w-[min(26rem,calc(100vw-2rem))] gap-m p-l">
        <DialogTitle>{m.analytics_title()}</DialogTitle>
        <DialogDescription>{m.analytics_description()}</DialogDescription>
        <div className="flex flex-wrap gap-s">
          <Button variant="secondary" onClick={() => onChoice("denied")}>
            {m.analytics_refuse()}
          </Button>
          <Button ref={accept} variant="secondary" onClick={() => onChoice("granted")}>
            {m.analytics_allow()}
          </Button>
        </div>
        <Link
          to="/privacy"
          hash="analytics"
          className="focus-ring self-start rounded-xs text-s underline underline-offset-2"
        >
          {m.analytics_details()}
        </Link>
      </DialogPopup>
    </Dialog>
  );
}

/** The choice can be revisited from the account tab, for a visitor as for an account. */
export function AnalyticsSetting() {
  const consent = useAnalyticsConsent();
  const errorReports = useErrorReports();
  const instanceErrorReports = useInstanceErrorReports();
  const id = useId();
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!analyticsConfigured || !ready) return null;
  return (
    <section className="grid gap-s">
      <h2 className="text-s font-medium text-neutral-7">{m.analytics_title()}</h2>
      <p className="text-s text-neutral-7">{m.analytics_description()}</p>
      <Button
        variant="secondary"
        size="sm"
        className="justify-self-start"
        onClick={() => setAnalyticsConsent(consent === "granted" ? "denied" : "granted")}
      >
        {consent === "granted" ? m.analytics_disable() : m.analytics_allow()}
      </Button>
      {/* An instance whose operator turned them off has no reports to choose. */}
      {consent === "granted" && instanceErrorReports && (
        <div className="flex items-start justify-between gap-m">
          <div className="grid gap-xxs">
            <span id={id}>{m.analytics_errors()}</span>
            <span id={`${id}-words`} className="text-s text-neutral-7">
              {m.analytics_errors_description()}
            </span>
          </div>
          <Switch
            aria-labelledby={id}
            aria-describedby={`${id}-words`}
            checked={errorReports}
            onCheckedChange={setErrorReports}
          />
        </div>
      )}
    </section>
  );
}
