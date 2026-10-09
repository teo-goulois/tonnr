import { Badge } from "@repo/ui/components/ui/badge";
import { Button } from "@repo/ui/components/ui/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import type { AccountDetail } from "@/lib/api";
import { formatAgo, formatCount, formatDate } from "@/lib/format";
import { m } from "@/paraglide/messages.js";
import { client, refreshLists } from "@/utils/orpc";

type AccountPageProps = {
  account: AccountDetail;
  // Whether it is the account of the operator who reads the page.
  isOwn: boolean;
  now: number;
  // Called once the operator closed their own sessions: this page's session is one of them.
  onSignedOut: () => void;
  // What operators did to the account: the route draws it.
  children: ReactNode;
};

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid content-start gap-xxs">
      <dt className="text-s text-neutral-7">{label}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  );
}

/**
 * One account, as an operator sees it: who it is, whether it is let in, and how many sessions
 * it has open. Nothing of what it keeps. Decision 025.
 */
export function AccountPage({ account, isOwn, now, onSignedOut, children }: AccountPageProps) {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<"sign-out" | "suspend" | null>(null);
  // A confirmation that ends closes itself, and not one that was opened since.
  const closing = (mine: typeof dialog) => (open: boolean) => {
    if (!open) setDialog((current) => (current === mine ? null : current));
  };
  const suspended = account.suspendedAt !== null;

  const signOut = useMutation({
    mutationFn: () => client.v1.accounts.signOut({ id: account.id }),
    onSuccess: async ({ closed }) => {
      toast.success(m.account_signed_out({ count: formatCount(closed) }));
      if (isOwn) onSignedOut();
      else await refreshLists(queryClient);
    },
    onError: (error) => toast.error(error.message),
  });
  const suspend = useMutation({
    mutationFn: (to: boolean) => client.v1.accounts.update({ id: account.id, suspended: to }),
    onSuccess: () => refreshLists(queryClient),
    onError: (error) => toast.error(error.message),
  });

  // One thing at a time is done to an account.
  const isBusy = signOut.isPending || suspend.isPending;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-s">
        <div className="flex min-w-0 items-center gap-s">
          <h1 className="truncate text-l font-medium">{account.name}</h1>
          {account.isOperator && <Badge>{m.account_operator()}</Badge>}
          {suspended && <Badge variant="warning">{m.account_suspended()}</Badge>}
        </div>
        <div className="flex items-center gap-xs">
          <Button variant="outline" disabled={isBusy} onClick={() => setDialog("sign-out")}>
            {isOwn ? m.account_sign_out_own() : m.account_sign_out()}
          </Button>
          {suspended ? (
            <Button
              variant="outline"
              isPending={suspend.isPending}
              disabled={isBusy}
              onClick={() => suspend.mutate(false)}
            >
              {m.account_resume()}
            </Button>
          ) : (
            !account.isOperator && (
              <Button variant="outline" disabled={isBusy} onClick={() => setDialog("suspend")}>
                {m.account_suspend()}
              </Button>
            )
          )}
        </div>
      </div>

      <dl className="grid gap-x-l gap-y-m sm:grid-cols-[repeat(auto-fit,minmax(12rem,1fr))]">
        <Fact label={m.auth_email()}>{account.email}</Fact>
        <Fact label={m.account_address_checked()}>{account.emailVerified ? m.yes() : m.no()}</Fact>
        <Fact label={m.account_created()}>{formatDate(account.createdAt)}</Fact>
        <Fact label={m.account_sessions()}>
          <span className="tabular-nums">{formatCount(account.sessions)}</span>
        </Fact>
        <Fact label={m.account_session_renewed()}>
          {account.sessionRenewedAt ? (
            <span className="grid gap-xxs">
              {formatAgo(account.sessionRenewedAt, now)}
              <span className="text-s text-neutral-7">{m.account_session_renewed_note()}</span>
            </span>
          ) : (
            m.never()
          )}
        </Fact>
        {account.suspendedAt && (
          <Fact label={m.account_suspended_since()}>{formatDate(account.suspendedAt)}</Fact>
        )}
      </dl>

      {account.isOperator && (
        <p className="max-w-(--container-2xl) text-s text-neutral-7">{m.account_operator_note()}</p>
      )}

      {children}

      <ConfirmDialog
        open={dialog === "sign-out"}
        onOpenChange={closing("sign-out")}
        title={m.account_sign_out_title({ name: account.name })}
        body={isOwn ? m.account_sign_out_own_body() : m.account_sign_out_body()}
        confirmLabel={isOwn ? m.account_sign_out_own() : m.account_sign_out()}
        onConfirm={() => signOut.mutateAsync()}
      />
      <ConfirmDialog
        open={dialog === "suspend"}
        onOpenChange={closing("suspend")}
        title={m.account_suspend_title({ name: account.name })}
        body={m.account_suspend_body()}
        confirmLabel={m.account_suspend()}
        onConfirm={() => suspend.mutateAsync(true)}
      />
    </>
  );
}
