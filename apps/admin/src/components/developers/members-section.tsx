import { Badge } from "@repo/ui/components/ui/badge";
import { Button } from "@repo/ui/components/ui/button";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/ui/table";
import { PlusIcon } from "@repo/ui/icon";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import type { Member } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { m } from "@/paraglide/messages.js";
import { client, refreshLists } from "@/utils/orpc";

import { AddMemberDialog } from "./add-member-dialog";

type MembersSectionProps = {
  developer: { id: string; name: string };
  // Undefined while they load.
  members: Member[] | undefined;
};

/**
 * The accounts that read a developer account in the console: decision 027. An operator names
 * them here, and nothing else does.
 */
export function MembersSection({ developer, members }: MembersSectionProps) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  // The member the dialog asks about. It stays while the dialog closes, so its name does not
  // blink.
  const [removing, setRemoving] = useState<Member | null>(null);
  const [asking, setAsking] = useState(false);
  const remove = useMutation({
    mutationFn: (accountId: string) =>
      client.v1.developers.removeMember({ id: developer.id, accountId }),
    onSuccess: () => refreshLists(queryClient),
    onError: (error) => toast.error(error.message),
  });

  return (
    <section className="grid grid-cols-1 gap-s">
      <div className="flex items-center justify-between gap-s">
        <h2 className="text-m font-medium">{m.members_title()}</h2>
        <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
          <PlusIcon aria-hidden />
          {m.member_add()}
        </Button>
      </div>
      <p className="max-w-(--container-2xl) text-s text-neutral-7">{m.members_hint()}</p>

      {members?.length === 0 ? (
        <p className="text-s text-neutral-7">{m.members_empty()}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{m.account_name()}</TableHead>
              <TableHead>{m.auth_email()}</TableHead>
              <TableHead>{m.member_added()}</TableHead>
              <TableHead>{m.state()}</TableHead>
              <TableHead>
                <span className="sr-only">{m.actions()}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members
              ? members.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell className="max-w-64 truncate font-medium">
                      <Link
                        to="/accounts/$accountId"
                        params={{ accountId: member.id }}
                        className="focus-ring rounded-(--radius-xs) underline-offset-4 outline-none hover:underline"
                      >
                        {member.name}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-72 truncate text-neutral-7">
                      {member.email}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-neutral-7">
                      {formatDate(member.addedAt)}
                    </TableCell>
                    <TableCell>
                      <span className="flex flex-wrap gap-xs">
                        {member.suspendedAt && (
                          <Badge variant="warning">{m.account_suspended()}</Badge>
                        )}
                        {member.emailVerified ? (
                          <Badge>{m.account_address_checked()}</Badge>
                        ) : (
                          <Badge variant="warning">{m.member_unchecked()}</Badge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setRemoving(member);
                          setAsking(true);
                        }}
                      >
                        {m.member_remove()}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              : [0, 1].map((row) => (
                  <TableRow key={row}>
                    <TableCell colSpan={5}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      )}

      <AddMemberDialog
        open={adding}
        onOpenChange={setAdding}
        developer={developer}
        members={members ?? []}
      />
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        title={m.member_remove_title({ name: removing?.name ?? "", developer: developer.name })}
        // Taking the last one out leaves the developer account to the operators alone.
        body={members?.length === 1 ? m.member_remove_last_body() : m.member_remove_body()}
        confirmLabel={m.member_remove()}
        onConfirm={() => (removing ? remove.mutateAsync(removing.id) : Promise.resolve())}
      />
    </section>
  );
}
