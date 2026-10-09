import { Badge } from "@repo/ui/components/ui/badge";
import { Button } from "@repo/ui/components/ui/button";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "@repo/ui/components/ui/menu";
import { MoreHorizontalIcon, PlusIcon } from "@repo/ui/icon";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import type { Developer, Key } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { m } from "@/paraglide/messages.js";
import { client, orpc } from "@/utils/orpc";

import { CallsMeter } from "./calls-meter";
import { DeveloperFormDialog } from "./developer-form-dialog";
import { KeysTable } from "./keys-table";
import { NewKeyDialog } from "./new-key-dialog";

type DeveloperPageProps = {
  developer: Developer;
  // Undefined while they load.
  keys: Key[] | undefined;
  now: number;
  onDeleted: () => void;
  // The account's calls: the route draws them, since it knows the span of time on screen.
  children: ReactNode;
};

/** One developer account: what the operator noted of it, its keys, and its calls. */
export function DeveloperPage({ developer, keys, now, onDeleted, children }: DeveloperPageProps) {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<"edit" | "key" | "delete" | null>(null);
  const close = (open: boolean) => !open && setDialog(null);
  const suspended = developer.suspendedAt !== null;

  const refresh = () => queryClient.invalidateQueries({ queryKey: orpc.v1.developers.key() });
  const suspend = useMutation({
    mutationFn: (to: boolean) => client.v1.developers.update({ id: developer.id, suspended: to }),
    onSuccess: refresh,
    onError: (error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: () => client.v1.developers.delete({ id: developer.id }),
    onSuccess: async () => {
      onDeleted();
      await Promise.all([
        refresh(),
        queryClient.invalidateQueries({ queryKey: orpc.v1.keys.key() }),
      ]);
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-s">
        <div className="flex min-w-0 items-center gap-s">
          <h1 className="truncate text-l font-medium">{developer.name}</h1>
          {suspended && <Badge variant="warning">{m.developer_suspended()}</Badge>}
        </div>
        <div className="flex items-center gap-xs">
          <Button variant="outline" onClick={() => setDialog("edit")}>
            {m.edit()}
          </Button>
          <Menu>
            <MenuTrigger
              render={<Button variant="outline" size="icon" aria-label={m.developer_more()} />}
            >
              <MoreHorizontalIcon data-slot="icon" aria-hidden />
            </MenuTrigger>
            <MenuPopup align="end" className="min-w-48">
              <MenuItem onClick={() => suspend.mutate(!suspended)}>
                {suspended ? m.developer_resume() : m.developer_suspend()}
              </MenuItem>
              <MenuSeparator />
              <MenuItem variant="destructive" onClick={() => setDialog("delete")}>
                {m.developer_delete()}
              </MenuItem>
            </MenuPopup>
          </Menu>
        </div>
      </div>

      <dl className="grid gap-x-l gap-y-m sm:grid-cols-[repeat(auto-fit,minmax(12rem,1fr))]">
        <div className="grid content-start gap-xxs">
          <dt className="text-s text-neutral-7">{m.developer_calls_this_hour()}</dt>
          <dd>
            <CallsMeter calls={developer.callsThisHour} limit={developer.callsPerHour} />
          </dd>
        </div>
        <div className="grid content-start gap-xxs">
          <dt className="text-s text-neutral-7">{m.developer_limit()}</dt>
          <dd>
            {developer.callsPerHour === null ? m.developer_no_limit() : developer.callsPerHour}
          </dd>
        </div>
        <div className="grid content-start gap-xxs">
          <dt className="text-s text-neutral-7">{m.developer_contact()}</dt>
          <dd className="break-words">{developer.contact ?? m.none()}</dd>
        </div>
        <div className="grid content-start gap-xxs">
          <dt className="text-s text-neutral-7">{m.developer_created()}</dt>
          <dd>{formatDate(developer.createdAt)}</dd>
        </div>
        {developer.note && (
          <div className="grid content-start gap-xxs sm:col-span-full">
            <dt className="text-s text-neutral-7">{m.developer_note()}</dt>
            <dd className="max-w-(--container-2xl) whitespace-pre-line">{developer.note}</dd>
          </div>
        )}
      </dl>

      <section className="grid grid-cols-1 gap-s">
        <div className="flex items-center justify-between gap-s">
          <h2 className="text-m font-medium">{m.developer_keys()}</h2>
          <Button variant="outline" size="sm" onClick={() => setDialog("key")}>
            <PlusIcon aria-hidden />
            {m.key_new()}
          </Button>
        </div>
        <KeysTable keys={keys} suspended={suspended} now={now} />
      </section>

      {children}

      <DeveloperFormDialog open={dialog === "edit"} onOpenChange={close} developer={developer} />
      <NewKeyDialog open={dialog === "key"} onOpenChange={close} developer={developer} />
      <ConfirmDialog
        open={dialog === "delete"}
        onOpenChange={close}
        title={m.developer_delete_title({ name: developer.name })}
        body={m.developer_delete_body()}
        confirmLabel={m.developer_delete()}
        onConfirm={() => remove.mutateAsync()}
      />
    </>
  );
}
