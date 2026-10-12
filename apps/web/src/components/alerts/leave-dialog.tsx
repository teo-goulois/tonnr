import { Button } from "@repo/ui/components/ui/button";
import { Dialog, DialogDescription, DialogPopup, DialogTitle } from "@repo/ui/components/ui/dialog";

import { answerLeaving, useIsLeaving } from "@/lib/unsaved";
import { m } from "@/paraglide/messages.js";

/**
 * The question asked before an alert that is written and not saved is left, over whatever is
 * open: what asks to leave may be another panel, the map, or the browser. Decision 031.
 */
export function LeaveDialog() {
  const isLeaving = useIsLeaving();
  return (
    <Dialog open={isLeaving} onOpenChange={(open) => !open && answerLeaving("stay")}>
      <DialogPopup className="w-full max-w-sm gap-l p-l">
        <div className="grid gap-xs">
          <DialogTitle>{m.alert_leave_title()}</DialogTitle>
          <DialogDescription>{m.alert_leave_unsaved()}</DialogDescription>
        </div>
        <div className="flex flex-wrap justify-end gap-xs">
          <Button variant="ghost" onClick={() => answerLeaving("stay")}>
            {m.alert_stay()}
          </Button>
          <Button variant="destructive" onClick={() => answerLeaving("leave")}>
            {m.alert_leave()}
          </Button>
        </div>
      </DialogPopup>
    </Dialog>
  );
}
