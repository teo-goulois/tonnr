import { Button } from "@repo/ui/components/ui/button";

import type { OperatorAction } from "@/lib/api";
import { m } from "@/paraglide/messages.js";

import { ActionsTable } from "./actions-table";

type ActivityPageProps = {
  // Undefined while the first page loads.
  actions: OperatorAction[] | undefined;
  // The ids of the developer accounts that still exist.
  existing: ReadonlySet<string>;
  // Set when earlier actions follow those on screen.
  onMore?: () => void;
  isLoadingMore: boolean;
};

/** What the operators did to the developer accounts and the keys, the latest first. */
export function ActivityPage({ actions, existing, onMore, isLoadingMore }: ActivityPageProps) {
  return (
    <>
      <h1 className="text-l font-medium">{m.nav_activity()}</h1>
      <ActionsTable actions={actions} existing={existing} empty={m.activity_empty()} />
      {onMore && (
        <div>
          <Button variant="outline" isPending={isLoadingMore} onClick={onMore}>
            {m.activity_more()}
          </Button>
        </div>
      )}
    </>
  );
}
