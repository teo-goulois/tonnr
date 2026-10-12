import { Button } from "@repo/ui/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogPopup,
  DialogTitle,
} from "@repo/ui/components/ui/dialog";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { XIcon } from "@repo/ui/icon";

import { UsernameForm } from "@/components/account/username-form";
import { m } from "@/paraglide/messages.js";

import { Username } from "../guides/rank";
import type { Invitation } from "./types";

type InviteDialogProps = {
  // The link the address names. The dialog is open while there is one.
  invitation: Invitation | undefined;
  signedIn: boolean;
  // The reader's own username, once the API has said: null for an account that has none, and
  // undefined for a visitor.
  username: string | null | undefined;
  onUsernameSave: (username: string) => Promise<string | undefined>;
};

/**
 * What whoever opens someone's link reads: whose it is, and what it makes. A visitor is asked
 * for an account, which then has the link's owner as its sponsor. An account becomes a friend
 * at its own word: opening the link alone makes nothing. Decision 041.
 */
export function InviteDialog({
  invitation,
  signedIn,
  username,
  onUsernameSave,
}: InviteDialogProps) {
  const inviter = invitation?.inviter.data;
  const isOwn = inviter !== undefined && username != null && inviter.username === username;

  return (
    <Dialog
      open={invitation !== undefined}
      onOpenChange={(open) => {
        if (!open) invitation?.onClose();
      }}
    >
      <DialogPopup className="w-[min(26rem,calc(100vw-2rem))] gap-m p-l">
        <div className="flex items-start justify-between gap-s">
          <div className="grid gap-xs">
            <DialogTitle className="flex flex-wrap items-center gap-x-xs">
              {inviter ? (
                <>
                  <Username name={inviter.username} rank={inviter.rank} size={24} />
                  <span>{m.invite_title_after()}</span>
                </>
              ) : invitation?.isGone ? (
                m.invite_gone()
              ) : (
                <Skeleton className="h-6 w-40" />
              )}
            </DialogTitle>
            {inviter && (
              <DialogDescription>
                {isOwn ? m.invite_own() : signedIn ? m.invite_text_signed_in() : m.invite_text()}
              </DialogDescription>
            )}
          </div>
          <DialogClose
            aria-label={m.action_close()}
            render={<Button variant="ghost" size="icon" className="-mt-xs -mr-xs" />}
          >
            <XIcon data-slot="icon" aria-hidden />
          </DialogClose>
        </div>

        {inviter &&
          !isOwn &&
          invitation &&
          (signedIn ? (
            username === null ? (
              // A friend is read by a name: an account that has none chooses it here.
              <div className="grid gap-xs">
                <p className="text-s">{m.invite_username_first()}</p>
                <UsernameForm current={null} onSave={onUsernameSave} onSaved={() => {}} />
              </div>
            ) : (
              <div className="flex flex-wrap gap-xs">
                <Button
                  isPending={invitation.isAccepting}
                  disabled={username === undefined}
                  onClick={invitation.onAccept}
                >
                  {m.invite_accept()}
                </Button>
                <Button
                  variant="ghost"
                  disabled={invitation.isAccepting}
                  onClick={invitation.onClose}
                >
                  {m.invite_later()}
                </Button>
              </div>
            )
          ) : (
            <div className="flex flex-wrap gap-xs">
              <Button onClick={invitation.onCreateAccount}>{m.auth_create_account()}</Button>
              <Button variant="ghost" onClick={invitation.onSignIn}>
                {m.invite_have_account()}
              </Button>
            </div>
          ))}
      </DialogPopup>
    </Dialog>
  );
}
