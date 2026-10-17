import { Button } from "@repo/ui/components/ui/button";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { useEffect, useRef, useState } from "react";

import { hasUnsaved, leaveWith } from "@/lib/unsaved";
import { m } from "@/paraglide/messages.js";

import type { Spot } from "../viewer/types";
import { ViewerDrawer } from "../viewer/viewer-drawer";
import { AlertEditor, type AlertPlace } from "./alert-editor";
import type { Written } from "./alert-words";
import type { TidePoint } from "./tide-band";
import type { Alerting } from "./types";

// The alert that is written, at the place it is written from: a spot of the account's own or a
// surf break of the catalogue (decision 064). `key` changes with each alert that is opened, and
// starts its editor over.
export type AlertWriting = Written & { place: AlertPlace; key: number };

type AlertSheetProps = {
  writing: AlertWriting | null;
  wide: boolean;
  now: number;
  // The account's spots. Undefined until they are known.
  spots: Spot[] | undefined;
  alerting: Alerting;
  // The tide at the place over the two days ahead, drawn beside what is asked of it.
  tide: TidePoint[];
  // Opens another alert in the sheet: a copy of the one that is written.
  onWrite: (written: Written) => void;
  // Closes the sheet. It is asked first when something written would be lost.
  onDone: () => void;
};

const mayDismiss = () => !hasUnsaved();

/**
 * The sheet an alert is written in, over whatever is open: a new one, from the "+", a spot's
 * alerts or its sessions, and one that is saved, to be changed, turned off or deleted. A saved
 * alert closes it. Decision 031.
 */
export function AlertSheet({
  writing,
  wide,
  now,
  spots,
  alerting,
  tide,
  onWrite,
  onDone,
}: AlertSheetProps) {
  // What the sheet showed stays drawn while it leaves.
  const [kept, setKept] = useState(writing);
  if (writing && writing !== kept) setKept(writing);
  const shown = writing ?? kept;

  const place = shown?.place;
  const alerts = alerting.alerts.data;
  const alert = shown?.alertId ? alerts?.find((one) => one.id === shown.alertId) : undefined;
  // An alert that was deleted, here or elsewhere, or a spot that was, is no longer written.
  const isGone =
    (shown?.alertId !== undefined && alerts !== undefined && !alert) ||
    (place?.kind === "spot" && spots !== undefined && !spots.some((one) => one.id === place.id));
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (writing && isGone) done.current();
  }, [writing, isGone]);

  // A new alert is written once the account's settings are known: they say whether it is asked
  // about mail, with that alert.
  const isReady = place && spots && alerts && (alert || alerting.settings.data);
  return (
    <ViewerDrawer
      open={writing !== null}
      identity={shown ? String(shown.key) : undefined}
      onOpenChange={(next) => {
        if (!next) leaveWith(onDone);
      }}
      mayDismiss={mayDismiss}
      onRest={(open) => {
        if (!open) setKept(null);
      }}
      wide={wide}
      title={alert?.name ?? m.alert_new()}
      description={place?.name}
      // As tall as a sheet goes: the editor's buttons stay at its bottom.
      fill
      opensRaised
    >
      {shown && isReady ? (
        <AlertEditor
          key={shown.key}
          now={now}
          place={place}
          spots={spots}
          alert={alert}
          initial={shown.initial}
          tide={tide}
          zone={alerting.settings.data?.zone ?? undefined}
          preview={alerting.preview}
          onTry={alerting.onTry}
          isSaving={alerting.isSaving}
          // Asked once, as an alert is made, of an account that never answered, on an instance
          // that sends mail.
          asksMail={
            !alert &&
            alerting.settings.data?.byMail === null &&
            alerting.settings.data.mail !== "off"
          }
          mailWaits={alerting.settings.data?.mail === "unchecked"}
          onSave={(draft, changed, byMail) =>
            alerting.onSave(alert, draft, changed, byMail).then((saved) => {
              if (saved) onDone();
              return saved;
            })
          }
          isDeleting={alerting.isDeleting}
          onDelete={alerting.onDelete}
          onCopy={(draft) =>
            onWrite({ initial: { ...draft, name: m.alert_copy_name({ name: draft.name }) } })
          }
        />
      ) : alerting.alerts.isError || alerting.settings.isError ? (
        <div className="grid justify-items-start gap-s">
          <p className="text-s text-neutral-7">
            {alerting.alerts.isError ? m.alerts_mine_load_failed() : m.alert_settings_load_failed()}
          </p>
          <Button variant="secondary" onClick={alerting.onRetry}>
            {m.action_retry()}
          </Button>
        </div>
      ) : (
        <div className="grid content-start gap-s">
          <Skeleton className="h-10 rounded-(--radius-xs)" />
          <Skeleton className="h-(--line-l) w-4/5 rounded-(--radius-xs)" />
          <Skeleton className="h-(--line-l) w-3/5 rounded-(--radius-xs)" />
        </div>
      )}
    </ViewerDrawer>
  );
}
