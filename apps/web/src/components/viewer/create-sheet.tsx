import {
  BellIcon,
  ChevronRightIcon,
  type IconProps,
  LogbookIcon,
  PinPlusIcon,
} from "@repo/ui/icon";
import type { ComponentType } from "react";

import { m } from "@/paraglide/messages.js";

import { ViewerDrawer } from "./viewer-drawer";

type CreateSheetProps = {
  open: boolean;
  onClose: () => void;
  wide: boolean;
  onAddSpot: () => void;
  // Begins an alert, which then asks where.
  onAddAlert: () => void;
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
 * What the "+" of a phone's bar opens: what an account adds, a session, a spot or an alert. Each
 * takes the sheet's place, and asks where when it has to. Decisions 040 and 043.
 */
export function CreateSheet({
  open,
  onClose,
  wide,
  onAddSpot,
  onAddAlert,
  onAddSession,
}: CreateSheetProps) {
  return (
    <ViewerDrawer
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      wide={wide}
      title={m.nav_add()}
    >
      <ul className="-mx-xs grid gap-xxs">
        {/* What is added most often comes first: a session after each time in the water. */}
        <Choice icon={LogbookIcon} label={m.create_session()} onClick={onAddSession} />
        <Choice icon={PinPlusIcon} label={m.create_spot()} onClick={onAddSpot} />
        <Choice icon={BellIcon} label={m.create_alert()} onClick={onAddAlert} />
      </ul>
    </ViewerDrawer>
  );
}
