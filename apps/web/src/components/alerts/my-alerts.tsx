import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { Switch } from "@repo/ui/components/ui/switch";

import { m } from "@/paraglide/messages.js";

import type { Alert, Loadable } from "../viewer/types";
import { AlertSummary } from "./alert-summary";

type MyAlertsProps = {
  alerts: Loadable<Alert[]>;
  // Opens the alert, at the first of its places.
  onOpen: (alert: Alert) => void;
  // The alerts whose switch is being saved: a switch waits for its answer before it moves again.
  switching: string[];
  onSwitch: (alert: Alert, enabled: boolean) => void;
};

/** The user's alerts, each with the places it is set on, what it asks, and its switch. */
export function MyAlerts({ alerts, onOpen, switching, onSwitch }: MyAlertsProps) {
  if (alerts.isPending) {
    return (
      <div className="grid gap-s">
        <Skeleton className="h-(--line-m) w-2/5 rounded-(--radius-xs)" />
        <Skeleton className="h-(--line-m) w-3/5 rounded-(--radius-xs)" />
      </div>
    );
  }
  if (alerts.isError) return <p className="text-s text-neutral-7">{m.alerts_mine_load_failed()}</p>;
  if (!alerts.data?.length) return <p className="text-neutral-7">{m.alerts_mine_empty()}</p>;

  return (
    <ul className="-mx-xs grid gap-xxs">
      {alerts.data.map((alert) => (
        <li key={alert.id} className="flex items-center gap-s">
          <button
            type="button"
            className="focus-ring grid min-w-0 flex-1 cursor-pointer gap-xxs rounded-(--radius-xs) px-xs py-xs text-left outline-none hover:bg-neutral-3-transparent"
            onClick={() => onOpen(alert)}
          >
            <span className="truncate font-medium">{alert.name}</span>
            <span className="truncate text-s text-neutral-7">
              {alert.places.map((place) => place.name).join(" · ")}
            </span>
            {/* Two alerts of one spot are told apart by what they ask. */}
            <span className="line-clamp-2 text-s text-neutral-7">
              <AlertSummary alert={alert} />
            </span>
          </button>
          <Switch
            className="mr-xs"
            aria-label={m.alerts_mine_switch({ name: alert.name })}
            checked={alert.enabled}
            disabled={switching.includes(alert.id)}
            onCheckedChange={(enabled) => onSwitch(alert, enabled)}
          />
        </li>
      ))}
    </ul>
  );
}
