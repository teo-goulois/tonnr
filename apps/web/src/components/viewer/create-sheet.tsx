import { Button } from "@repo/ui/components/ui/button";
import {
  BellIcon,
  ChevronRightIcon,
  type IconProps,
  LogbookIcon,
  PinPlusIcon,
} from "@repo/ui/icon";
import { type ComponentType, useState } from "react";

import { m } from "@/paraglide/messages.js";

import { SpotRow, StationRowSkeleton } from "./saved-panel";
import type { Spot } from "./types";
import { ViewerDrawer } from "./viewer-drawer";

type CreateSheetProps = {
  open: boolean;
  onClose: () => void;
  wide: boolean;
  signedIn: boolean;
  // The account's own spots: an alert is set on one of them. Undefined while they load.
  spots: Spot[] | undefined;
  onAddSpot: () => void;
  // Begins an alert at a spot. A visitor names none, and is asked for an account.
  onAddAlert: (spotId?: string) => void;
  // Begins a session of the log, which then asks where it was.
  onAddSession: () => void;
};

function Choice({
  icon: ChoiceIcon,
  label,
  onClick,
}: {
  icon: ComponentType<IconProps>;
  label: string;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        className="focus-ring flex min-h-14 w-full cursor-pointer items-center gap-s rounded-(--radius-xs) px-xs text-left outline-none hover:bg-neutral-3-transparent"
        onClick={onClick}
      >
        <span
          aria-hidden
          className="grid size-10 shrink-0 place-items-center rounded-full bg-neutral-3"
        >
          <ChoiceIcon className="size-4.5" />
        </span>
        <span className="min-w-0 flex-1">{label}</span>
        <ChevronRightIcon data-slot="icon" aria-hidden className="shrink-0 text-neutral-7" />
      </button>
    </li>
  );
}

/**
 * What the "+" of a phone's bar opens: what an account adds, a session, a spot or an alert. An
 * alert is set on a spot: an account that has several says which, and one that has none is led
 * to add one first. Decisions 040 and 043.
 */
export function CreateSheet({
  open,
  onClose,
  wide,
  signedIn,
  spots,
  onAddSpot,
  onAddAlert,
  onAddSession,
}: CreateSheetProps) {
  // The second step, which asks where the alert goes. The sheet opens on its first step.
  const [isChoosingSpot, setIsChoosingSpot] = useState(false);
  if (!open && isChoosingSpot) setIsChoosingSpot(false);

  return (
    <ViewerDrawer
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      wide={wide}
      title={isChoosingSpot ? m.alert_new() : m.nav_add()}
      description={isChoosingSpot && spots?.length !== 0 ? m.create_alert_spot() : undefined}
      onBack={isChoosingSpot ? () => setIsChoosingSpot(false) : undefined}
    >
      {!isChoosingSpot ? (
        <ul className="-mx-xs grid gap-xxs">
          {/* What is added most often comes first: a session after each time in the water. */}
          <Choice icon={LogbookIcon} label={m.create_session()} onClick={onAddSession} />
          <Choice icon={PinPlusIcon} label={m.create_spot()} onClick={onAddSpot} />
          <Choice
            icon={BellIcon}
            label={m.create_alert()}
            onClick={() => {
              if (!signedIn) onAddAlert();
              // One spot is the only place the alert can go.
              else if (spots?.length === 1) onAddAlert(spots[0]!.id);
              else setIsChoosingSpot(true);
            }}
          />
        </ul>
      ) : spots === undefined ? (
        <ul className="-mx-xs grid gap-xxs">
          <StationRowSkeleton />
          <StationRowSkeleton />
        </ul>
      ) : spots.length === 0 ? (
        <div className="grid justify-items-start gap-s">
          <p className="text-neutral-7">{m.create_alert_no_spot()}</p>
          <Button variant="secondary" onClick={onAddSpot}>
            {m.spot_add()}
          </Button>
        </div>
      ) : (
        <ul className="-mx-xs grid gap-xxs">
          {spots.map((spot) => (
            <SpotRow key={spot.id} spot={spot} onSelect={() => onAddAlert(spot.id)} />
          ))}
        </ul>
      )}
    </ViewerDrawer>
  );
}
