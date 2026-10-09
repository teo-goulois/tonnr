import { Badge } from "@repo/ui/components/ui/badge";
import { Button } from "@repo/ui/components/ui/button";
import { Dialog, DialogDescription, DialogPopup, DialogTitle } from "@repo/ui/components/ui/dialog";
import { Input } from "@repo/ui/components/ui/input";
import { cn } from "@repo/ui/lib/utils";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import type { Account } from "@/lib/api";
import { formatCount } from "@/lib/format";
import { m } from "@/paraglide/messages.js";
import { client, orpc, refreshLists } from "@/utils/orpc";

type AddMemberDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  developer: { id: string; name: string };
  // The accounts that are members already: they are shown, and not offered again.
  members: { id: string }[];
};

/**
 * Names the account that will read a developer account in the console. The operator searches
 * a name or an address and chooses one account by what tells it from the others. An address
 * proves nothing of who holds an account, so nothing here chooses for the operator.
 */
export function AddMemberDialog({ open, onOpenChange, developer, members }: AddMemberDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="w-full max-w-lg gap-l p-l">
        {/* It lives while the dialog is open: a search is not kept for the next time. */}
        <AddMember developer={developer} members={members} onDone={() => onOpenChange(false)} />
      </DialogPopup>
    </Dialog>
  );
}

// How many accounts a search shows. More than that, and the search is to be made narrower.
const SHOWN = 6;

type AddMemberProps = Pick<AddMemberDialogProps, "developer" | "members"> & { onDone: () => void };

function AddMember({ developer, members, onDone }: AddMemberProps) {
  const queryClient = useQueryClient();
  const [typed, setTyped] = useState("");
  // What is asked of the API, once the typing pauses.
  const [asked, setAsked] = useState("");
  const [chosen, setChosen] = useState<Account | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setAsked(typed.trim()), 250);
    return () => clearTimeout(timer);
  }, [typed]);

  const found = useQuery(
    orpc.v1.accounts.list.queryOptions({
      input: { q: asked, limit: SHOWN },
      enabled: asked !== "",
      placeholderData: keepPreviousData,
    }),
  );
  const add = useMutation({
    mutationFn: (accountId: string) =>
      client.v1.developers.addMember({ id: developer.id, accountId }),
    onSuccess: async () => {
      await refreshLists(queryClient);
      onDone();
    },
    onError: (error) => toast.error(error.message),
  });

  const accounts = asked === "" ? [] : (found.data?.accounts ?? []);
  const more = asked === "" ? 0 : (found.data?.total ?? 0) - accounts.length;
  const isMember = (account: Account) => members.some((member) => member.id === account.id);

  return (
    <>
      <div className="grid gap-xs">
        <DialogTitle>{m.member_add_title({ developer: developer.name })}</DialogTitle>
        <DialogDescription>{m.member_add_body()}</DialogDescription>
      </div>

      <div className="grid gap-s">
        <Input
          type="search"
          aria-label={m.accounts_search()}
          placeholder={m.accounts_search()}
          autoComplete="off"
          autoFocus
          value={typed}
          onChange={(event) => {
            setTyped(event.target.value);
            // What was chosen belonged to another search.
            setChosen(null);
          }}
        />
        {asked !== "" && found.data && accounts.length === 0 && (
          <p className="text-s text-neutral-7">{m.accounts_none_found()}</p>
        )}
        {accounts.length > 0 && (
          <ul className="grid gap-xxs">
            {accounts.map((account) => {
              const already = isMember(account);
              return (
                <li key={account.id}>
                  <button
                    type="button"
                    disabled={already}
                    aria-pressed={chosen?.id === account.id}
                    onClick={() => setChosen(account)}
                    className={cn(
                      // structure & layout
                      "grid w-full gap-xxs rounded-(--radius-xs) px-s py-xs text-left",
                      // focus
                      "focus-ring outline-none",
                      // transitions
                      "transition-colors duration-(--motion-duration) ease-theme",
                      // state: hover, the account chosen, and one that is a member already
                      "hover:bg-neutral-2 aria-pressed:bg-neutral-3 disabled:opacity-60 disabled:hover:bg-transparent",
                    )}
                  >
                    <span className="flex flex-wrap items-center gap-xs">
                      <span className="min-w-0 truncate font-medium">{account.name}</span>
                      {already && <Badge>{m.member_already()}</Badge>}
                      {account.isOperator && <Badge>{m.account_operator()}</Badge>}
                      {account.suspendedAt && (
                        <Badge variant="warning">{m.account_suspended()}</Badge>
                      )}
                      {!account.emailVerified && (
                        <Badge variant="warning">{m.member_unchecked()}</Badge>
                      )}
                    </span>
                    {/* The whole address and the identifier: two accounts may share a name. */}
                    <span className="text-s break-all text-neutral-7">{account.email}</span>
                    <span className="font-mono text-s break-all text-neutral-7">{account.id}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {more > 0 && (
          <p className="text-s text-neutral-7">{m.member_more({ count: formatCount(more) })}</p>
        )}
      </div>

      {chosen && (
        <div className="grid gap-xxs text-s text-neutral-7" role="status">
          <p>{m.member_chosen({ name: chosen.name, email: chosen.email })}</p>
          {!chosen.emailVerified && <p>{m.member_unchecked_note()}</p>}
          {chosen.suspendedAt && <p>{m.member_suspended_note()}</p>}
        </div>
      )}

      <div className="flex justify-end gap-xs">
        <Button variant="ghost" disabled={add.isPending} onClick={onDone}>
          {m.cancel()}
        </Button>
        <Button
          disabled={chosen === null}
          isPending={add.isPending}
          onClick={() => chosen && add.mutate(chosen.id)}
        >
          {m.member_add_confirm()}
        </Button>
      </div>
    </>
  );
}
