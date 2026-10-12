import type { Alert, AlertPreview, AlertSettings, Loadable } from "../viewer/types";
import type { AlertDraft, AlertTrial } from "./alert-words";
import type { AlertSettingsChange } from "./alert-settings";

/** What the screens of the alerts read and ask for, which the route answers. */
export type Alerting = {
  alerts: Loadable<Alert[]>;
  settings: Loadable<AlertSettings>;
  // Asks again for the alerts and the settings, when one of them could not be had.
  onRetry: () => void;
  // The time zone of this device, which an account that has set none takes with its first alert.
  deviceZone: string;
  // What the alert that is being written gives at its spots.
  preview: Loadable<AlertPreview>;
  onTry: (trial: AlertTrial) => void;
  isSaving: boolean;
  // Saves an alert: a new one, whole, when `alert` is undefined, and otherwise what of it was
  // changed. `byMail` is what the account answered when it was asked whether it wants mail.
  // Answers the alert as it is saved, or nothing when it could not be.
  onSave: (
    alert: Alert | undefined,
    draft: AlertDraft,
    changed: Partial<AlertDraft>,
    byMail?: boolean,
  ) => Promise<Alert | undefined>;
  isDeleting: boolean;
  onDelete: (alert: Alert) => void;
  // The editor of an alert says whether it holds something that leaving its spot would lose,
  // and whoever is about to leave asks.
  onUnsaved: (hasUnsaved: boolean) => void;
  hasUnsaved: () => boolean;
  // Set while something asks to leave the spot whose alert is being written and not saved: the
  // panel closed, another selection, another page. It waits for one of the two answers.
  leaving: { onLeave: () => void; onStay: () => void } | null;
  // The alerts whose switch is being saved.
  switching: string[];
  onSwitch: (alert: Alert, enabled: boolean) => void;
  onSettingsChange: (change: AlertSettingsChange) => void;
};
