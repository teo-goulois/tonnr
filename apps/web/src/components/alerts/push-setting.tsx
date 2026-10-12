import { APP_NAME } from "@repo/config/app";
import { Badge } from "@repo/ui/components/ui/badge";
import { Button } from "@repo/ui/components/ui/button";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { Switch } from "@repo/ui/components/ui/switch";
import { TrashIcon } from "@repo/ui/icon";
import { useId } from "react";

import { formatAgo } from "@/lib/format";
import type { PushFailure, PushState, Pushing } from "@/lib/use-push";
import { m } from "@/paraglide/messages.js";

type PushSettingProps = Pushing & { now: number };

// What the row says under its name: what stands in the way of a switch, what a switch is
// doing, or what push is.
function wordsOf(state: PushState) {
  if (state.kind === "unknown") return m.push_unknown();
  if (state.kind === "unsure") return m.push_unsure();
  if (state.kind === "none") return m.push_none();
  if (state.kind === "unable") return m.push_unable();
  if (state.kind === "home-screen") return m.push_home_screen({ name: APP_NAME });
  if (state.kind === "refused") return m.push_refused();
  if (state.kind === "loading" || !state.isBusy) return m.push_hint();
  return state.kind === "off" ? m.push_switching_on() : m.push_switching_off();
}

function failureOf(failure: PushFailure) {
  if (failure === "full") return m.push_full();
  return failure === "on" ? m.push_failed_on() : m.push_failed_off();
}

/** Push on this device, and the devices the account's alerts are pushed to. */
export function PushSetting({
  state,
  devices,
  deviceId,
  removing,
  now,
  onSwitch,
  onRemove,
  onRetry,
}: PushSettingProps) {
  const id = useId();
  const hasSwitch = state.kind === "on" || state.kind === "off";
  const isBusy = hasSwitch && state.isBusy;
  // This device first, then the others as the API lists them.
  const listed = [...(devices.data ?? [])].sort(
    (a, b) => Number(b.id === deviceId) - Number(a.id === deviceId),
  );

  return (
    <div className="grid gap-s">
      {state.kind === "loading" ? (
        <Skeleton className="h-(--line-m) w-3/5 rounded-(--radius-xs)" />
      ) : (
        <div className="flex items-start justify-between gap-m">
          <div className="grid gap-xxs">
            <span id={id} className={hasSwitch ? undefined : "text-neutral-7"}>
              {m.push_title()}
            </span>
            {/* Said again when it changes: a switch on its way, and what came of it. */}
            <span id={`${id}-words`} aria-live="polite" className="text-s text-neutral-7">
              {wordsOf(state)}
            </span>
            {hasSwitch && state.failure && (
              <span role="alert" className="text-s text-error">
                {failureOf(state.failure)}
              </span>
            )}
            {(state.kind === "unknown" || state.kind === "unsure") && (
              <Button className="justify-self-start" variant="ghost" size="sm" onClick={onRetry}>
                {m.push_retry()}
              </Button>
            )}
          </div>
          {hasSwitch && (
            <Switch
              aria-labelledby={id}
              aria-describedby={`${id}-words`}
              aria-busy={isBusy}
              checked={state.kind === "on"}
              // A switch waits for its answer before it moves again.
              disabled={isBusy}
              onCheckedChange={onSwitch}
            />
          )}
        </div>
      )}

      {devices.isError && <p className="text-s text-neutral-7">{m.push_devices_failed()}</p>}
      {listed.length > 0 && (
        <div className="grid gap-xs">
          <p id={`${id}-devices`} className="text-s text-neutral-7">
            {m.push_devices()}
          </p>
          <ul aria-labelledby={`${id}-devices`} className="grid gap-xxs">
            {listed.map((device) => {
              const isHere = device.id === deviceId;
              const name = device.label ?? m.push_device_unnamed();
              return (
                <li key={device.id} className="flex items-center justify-between gap-s">
                  <span className="grid min-w-0 gap-xxs">
                    <span className="flex min-w-0 items-center gap-xs">
                      <span className="truncate">{name}</span>
                      {isHere && <Badge variant="neutral">{m.push_device_here()}</Badge>}
                    </span>
                    <span className="text-s text-neutral-7">
                      {m.push_device_seen({ ago: formatAgo(device.seenAt, now) })}
                    </span>
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={m.push_device_remove({ name })}
                    disabled={removing.includes(device.id) || (isHere && isBusy)}
                    onClick={() => onRemove(device)}
                  >
                    <TrashIcon data-slot="icon" aria-hidden />
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
