import type { Alert, AlertPreview, AlertSettings, Loadable } from "../viewer/types";
import type { AlertDraft, AlertTrial } from "./alert-words";
import type { AlertSettingsChange } from "./alert-settings";

/** What the screens of the alerts read and ask for, which the route answers. */
export type Alerting = {
  alerts: Loadable<Alert[]>;
  settings: Loadable<AlertSettings>;
  // The time zone of this device, which an account that has set none takes with its first alert.
  deviceZone: string;
  // What the alert that is being written gives at its spots.
  preview: Loadable<AlertPreview>;
  onTry: (trial: AlertTrial) => void;
  isSaving: boolean;
  // Saves an alert: a new one, whole, when `alert` is undefined, and otherwise what of it was
  // changed.
  onSave: (alert: Alert | undefined, draft: AlertDraft, changed: Partial<AlertDraft>) => void;
  isDeleting: boolean;
  onDelete: (alert: Alert) => void;
  // The alerts whose switch is being saved.
  switching: string[];
  onSwitch: (alert: Alert, enabled: boolean) => void;
  onSettingsChange: (change: AlertSettingsChange) => void;
};
