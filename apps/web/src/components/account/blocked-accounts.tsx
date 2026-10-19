import { Button } from "@repo/ui/components/ui/button";
import { Dialog, DialogDescription, DialogPopup, DialogTitle } from "@repo/ui/components/ui/dialog";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { useState } from "react";

import { m } from "@/paraglide/messages.js";

import type { BlockedAccount, Loadable } from "../viewer/types";

/**
 * The accounts the signed-in account blocked, and what blocks and unblocks one: the route gives
 * it. A block hides the other's reports, what it has waiting in a guide and its username, and
 * ends a friendship. The blocked account is not told. Decision 071.
 */
export type Blocking = {
  // Its data is undefined for a visitor, and while the list is not asked for.
  blocks: Loadable<BlockedAccount[]>;
  // Asks whether to block the account of this username, and blocks it once the reader says so.
  // A visitor is asked for an account first, and then asked this.
  onBlock: (username: string) => void;
  // The account whose block is being lifted, while it is.
  unblocking: string | undefined;
  onUnblock: (account: BlockedAccount) => void;
  // The account the reader is asked about, and what answers.
  asked: string | undefined;
  isBlocking: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * The question asked before an account is blocked, over whatever is open: what it hides, and
 * that the other is not told.
 */
export function BlockDialog({ blocking }: { blocking: Blocking }) {
  // The name stays while the dialog fades out.
  const [username, setUsername] = useState(blocking.asked);
  if (blocking.asked !== undefined && blocking.asked !== username) setUsername(blocking.asked);
  return (
    <Dialog
      open={blocking.asked !== undefined}
      onOpenChange={(open) => {
        if (!open) blocking.onCancel();
      }}
    >
      <DialogPopup className="w-full max-w-sm gap-l p-l">
        <div className="grid gap-xs">
          <DialogTitle>{m.block_confirm_title({ username: username ?? "" })}</DialogTitle>
          <DialogDescription>{m.block_confirm_text()}</DialogDescription>
        </div>
        <div className="flex flex-wrap justify-end gap-xs">
          <Button variant="ghost" disabled={blocking.isBlocking} onClick={blocking.onCancel}>
            {m.action_cancel()}
          </Button>
          <Button
            variant="destructive"
            isPending={blocking.isBlocking}
            onClick={blocking.onConfirm}
          >
            {m.block_confirm()}
          </Button>
        </div>
      </DialogPopup>
    </Dialog>
  );
}

/**
 * One step into the account's panel: the accounts it blocked, each with what lifts the block.
 * Decision 071.
 */
export function BlockedAccounts({ blocking }: { blocking: Blocking }) {
  const blocks = blocking.blocks.data;
  return (
    <div className="grid gap-l">
      <p className="text-s text-pretty text-neutral-7">{m.blocks_intro()}</p>
      {!blocks ? (
        blocking.blocks.isError ? (
          <p className="text-s text-neutral-7">{m.blocks_failed()}</p>
        ) : (
          <Skeleton className="h-11 w-full" />
        )
      ) : blocks.length === 0 ? (
        <p className="text-s text-neutral-7">{m.blocks_empty()}</p>
      ) : (
        <ul className="grid gap-xs">
          {blocks.map((one) => (
            <li key={one.id} className="flex min-h-11 items-center justify-between gap-s">
              <span className="truncate font-medium">
                {one.username ? `@${one.username}` : m.friends_no_name()}
              </span>
              <Button
                variant="outline"
                size="sm"
                isPending={blocking.unblocking === one.id}
                disabled={blocking.unblocking !== undefined}
                onClick={() => blocking.onUnblock(one)}
              >
                {m.block_unblock()}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
