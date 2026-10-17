import { Button } from "@repo/ui/components/ui/button";
import { Switch } from "@repo/ui/components/ui/switch";
import { ChevronRightIcon, PlusIcon } from "@repo/ui/icon";

import { m } from "@/paraglide/messages.js";

import type { Alert } from "../viewer/types";
import { AlertSummary } from "./alert-summary";

type SpotAlertsProps = {
  // The place whose panel this is, a spot of the user's or a surf break: the others an alert
  // is set on are named after it.
  placeId: string;
  // The alerts the place is in, the oldest first.
  alerts: Alert[];
  // Opens an alert to change it, and starts a new one.
  onOpen: (alert: Alert) => void;
  onNew: () => void;
  // The alerts whose switch is being saved: a switch waits for its answer before it moves again.
  switching: string[];
  onSwitch: (alert: Alert, enabled: boolean) => void;
};

/**
 * The alerts of a place, a spot of the user's or a surf break: each with its name, what it asks,
 * and its switch. A place may have several, one for each kind of sea that makes it work.
 * Decisions 031 and 064.
 */
export function SpotAlerts({
  placeId,
  alerts,
  onOpen,
  onNew,
  switching,
  onSwitch,
}: SpotAlertsProps) {
  if (alerts.length === 0) {
    return (
      <div className="grid justify-items-start gap-s">
        <p className="text-s text-neutral-7">{m.alert_none()}</p>
        <Button type="button" variant="secondary" onClick={onNew}>
          {m.alert_create()}
        </Button>
      </div>
    );
  }

  return (
    <div className="grid justify-items-start gap-m">
      <ul className="-mx-xs grid gap-xxs justify-self-stretch">
        {alerts.map((alert) => {
          const others = alert.places.flatMap((place) =>
            (place.spotId ?? place.breakId) === placeId ? [] : place.name,
          );
          return (
            <li key={alert.id} className="flex items-center gap-s">
              <button
                type="button"
                aria-label={m.alert_open({ name: alert.name })}
                className="focus-ring flex min-w-0 flex-1 cursor-pointer items-center gap-xs rounded-(--radius-xs) px-xs py-xs text-left outline-none hover:bg-neutral-3-transparent"
                onClick={() => onOpen(alert)}
              >
                <span className="grid min-w-0 flex-1 gap-xxs">
                  <span className="truncate font-medium">{alert.name}</span>
                  <span className="line-clamp-2 text-s text-neutral-7">
                    <AlertSummary alert={alert} />
                  </span>
                  {others.length > 0 && (
                    <span className="truncate text-s text-neutral-7">
                      {m.alert_also_on()} {others.join(" · ")}
                    </span>
                  )}
                </span>
                <ChevronRightIcon data-slot="icon" aria-hidden className="text-neutral-7" />
              </button>
              <Switch
                className="mr-xs"
                aria-label={m.alerts_mine_switch({ name: alert.name })}
                checked={alert.enabled}
                disabled={switching.includes(alert.id)}
                onCheckedChange={(enabled) => onSwitch(alert, enabled)}
              />
            </li>
          );
        })}
      </ul>
      <Button type="button" variant="secondary" onClick={onNew}>
        <PlusIcon data-slot="icon" aria-hidden />
        {m.alert_new()}
      </Button>
    </div>
  );
}
