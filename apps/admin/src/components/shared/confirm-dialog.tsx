import { Button } from "@repo/ui/components/ui/button";
import { Dialog, DialogDescription, DialogPopup, DialogTitle } from "@repo/ui/components/ui/dialog";
import { useState } from "react";

import { m } from "@/paraglide/messages.js";

type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  // What the action does that cannot be taken back.
  body: string;
  confirmLabel: string;
  // Does it. The dialog closes when it succeeds, and stays open when it fails.
  onConfirm: () => Promise<unknown>;
};

/** Asks before something that cannot be undone. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  onConfirm,
}: ConfirmDialogProps) {
  const [isPending, setPending] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="w-full max-w-md gap-l p-l">
        <div className="grid gap-xs">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </div>
        <div className="flex justify-end gap-xs">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {m.cancel()}
          </Button>
          <Button
            variant="destructive"
            isPending={isPending}
            onClick={() => {
              setPending(true);
              onConfirm()
                .then(() => onOpenChange(false))
                // The caller says what went wrong.
                .catch(() => {})
                .finally(() => setPending(false));
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </DialogPopup>
    </Dialog>
  );
}
