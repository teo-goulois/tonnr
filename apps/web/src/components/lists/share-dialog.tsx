import { Button } from "@repo/ui/components/ui/button";
import { Dialog, DialogDescription, DialogPopup, DialogTitle } from "@repo/ui/components/ui/dialog";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { CopyIcon, LockIcon } from "@repo/ui/icon";
import { useId, useState } from "react";
import { toast } from "sonner";

import { m } from "@/paraglide/messages.js";
import { localizeHref } from "@/paraglide/runtime.js";

import { listName } from "../viewer/station-actions";
import type { SavedList } from "../viewer/types";

// A password as the API takes it.
const PASSWORD_LEAST = 4;
const PASSWORD_MOST = 72;

/** The address a list is sent by, in the language of whoever sends it. */
export function linkOf(token: string) {
  return new URL(localizeHref(`/l/${token}`), window.location.origin).href;
}

type ShareListDialogProps = {
  // The list being shared. The dialog is open while there is one.
  list: SavedList | undefined;
  onClose: () => void;
  // How many of the list's spots only their owner sees today.
  privateSpots: number;
  // True while the API is asked: it is not asked twice.
  isSaving: boolean;
  // Makes the link, or changes what it asks: a password, or null for none.
  onShare: (password?: string | null) => void;
  onRenew: () => void;
  onStop: () => void;
};

/**
 * Sharing a list: its link to copy, the password it may ask for, and what ends it. The list's
 * private spots are said before the link is made: whoever has it sees them.
 */
export function ShareListDialog({
  list,
  onClose,
  privateSpots,
  isSaving,
  onShare,
  onRenew,
  onStop,
}: ShareListDialogProps) {
  const [password, setPassword] = useState("");
  const linkId = useId();
  const passwordId = useId();
  const share = list?.share;
  const link = share ? linkOf(share.token) : "";

  const warning = privateSpots > 0 && (
    <p className="flex items-start gap-xs rounded-(--radius-s) bg-warning-transparent p-s text-s">
      <LockIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      {privateSpots === 1 ? m.share_private_one() : m.share_private_some({ count: privateSpots })}
    </p>
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      toast.success(m.share_copied());
    } catch {
      toast.error(m.share_copy_failed());
    }
  }

  return (
    <Dialog
      open={list !== undefined}
      onOpenChange={(open) => {
        if (open) return;
        setPassword("");
        onClose();
      }}
    >
      <DialogPopup className="w-full max-w-md gap-l p-l">
        <div className="grid gap-xs">
          <DialogTitle>{m.share_title({ name: list ? listName(list) : "" })}</DialogTitle>
          <DialogDescription>{m.share_what()}</DialogDescription>
        </div>

        {!share ? (
          <>
            {warning}
            <div className="flex flex-wrap justify-end gap-xs">
              <Button variant="ghost" onClick={onClose}>
                {m.action_cancel()}
              </Button>
              <Button isPending={isSaving} onClick={() => onShare()}>
                {m.share_create()}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="grid gap-xs">
              <Label htmlFor={linkId}>{m.share_link()}</Label>
              <div className="flex items-center gap-xs">
                <Input
                  id={linkId}
                  readOnly
                  value={link}
                  onFocus={(event) => event.target.select()}
                />
                <Button variant="secondary" onClick={() => void copy()}>
                  <CopyIcon data-slot="icon" aria-hidden />
                  {m.share_copy()}
                </Button>
              </div>
              <p className="text-s text-neutral-7">
                {share.members === 0
                  ? m.share_members_none()
                  : share.members === 1
                    ? m.share_members_one()
                    : m.share_members_some({ count: share.members })}
              </p>
            </div>

            {warning}

            {share.hasPassword ? (
              <div className="flex flex-wrap items-center justify-between gap-xs">
                <p className="flex items-center gap-xs">
                  <LockIcon aria-hidden className="size-3.5" />
                  {m.share_password_on()}
                </p>
                <Button variant="ghost" size="sm" disabled={isSaving} onClick={() => onShare(null)}>
                  {m.share_password_remove()}
                </Button>
              </div>
            ) : (
              <form
                className="grid gap-xs"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (password.length < PASSWORD_LEAST || isSaving) return;
                  onShare(password);
                  setPassword("");
                }}
              >
                <Label htmlFor={passwordId}>{m.share_password()}</Label>
                <div className="flex items-center gap-xs">
                  <Input
                    id={passwordId}
                    value={password}
                    minLength={PASSWORD_LEAST}
                    maxLength={PASSWORD_MOST}
                    placeholder={m.share_password_placeholder()}
                    autoComplete="off"
                    disabled={isSaving}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  <Button
                    type="submit"
                    variant="secondary"
                    disabled={password.length < PASSWORD_LEAST}
                    isPending={isSaving}
                  >
                    {m.share_password_add()}
                  </Button>
                </div>
              </form>
            )}

            <div className="flex flex-wrap justify-between gap-xs">
              <Button variant="ghost" size="sm" disabled={isSaving} onClick={onRenew}>
                {m.share_renew()}
              </Button>
              <Button variant="ghost" size="sm" disabled={isSaving} onClick={onStop}>
                {m.share_stop()}
              </Button>
            </div>
          </>
        )}
      </DialogPopup>
    </Dialog>
  );
}
