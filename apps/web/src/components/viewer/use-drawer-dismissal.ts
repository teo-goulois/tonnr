import { useState } from "react";

/** Let the drawer finish closing before navigation changes the map and its queries. */
export function useDrawerDismissal(
  open: boolean,
  identity: string | undefined,
  onOpenChange: (open: boolean) => void,
  onRest?: (open: boolean) => void,
) {
  const [dismissal, setDismissal] = useState<{
    identity: string | undefined;
    notified: boolean;
  } | null>(null);
  // A different selection, or a completed route change, ends the local dismissal. In
  // particular, closing one station must not close another opened during its exit.
  const closing = open && dismissal !== null && dismissal.identity === identity;
  if (dismissal && !closing) setDismissal(null);

  return {
    open: open && !closing,
    onOpenChange: (next: boolean) => {
      if (next) onOpenChange(true);
      else if (!closing) setDismissal({ identity, notified: false });
    },
    onOpenChangeComplete: (next: boolean) => {
      if (next !== (open && !closing)) return;
      onRest?.(next);
      if (!next && closing && !dismissal.notified) {
        setDismissal({ ...dismissal, notified: true });
        onOpenChange(false);
      }
    },
  };
}
