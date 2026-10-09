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
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import type { Key } from "@/lib/api";
import { formatAgo, formatDate } from "@/lib/format";
import { m } from "@/paraglide/messages.js";
import { client, refreshLists } from "@/utils/orpc";

// What the table shows of a key: what an operator's list gives, and the console's.
type ShownKey = Pick<Key, "id" | "name" | "prefix" | "createdAt" | "lastUsedAt" | "revokedAt">;

type KeysTableProps = {
  // Undefined while they load.
  keys: ShownKey[] | undefined;
  // Whether the keys' developer account is suspended: none of them works then.
  suspended?: boolean;
  // Set in the console: a member reads the keys, and revokes none.
  readOnly?: boolean;
  now: number;
};

/**
 * The keys of a developer account, the newest first. An operator can revoke a key that works.
 */
export function KeysTable({ keys, suspended = false, readOnly = false, now }: KeysTableProps) {
  const queryClient = useQueryClient();
  // The key the dialog asks about. It stays while the dialog closes, so its name does not blink.
  const [revoking, setRevoking] = useState<ShownKey | null>(null);
  const [asking, setAsking] = useState(false);
  const revoke = useMutation({
    mutationFn: (id: string) => client.v1.keys.revoke({ id }),
    onSuccess: () => refreshLists(queryClient),
    onError: (error) => toast.error(error.message),
  });

  if (keys?.length === 0) return <p className="text-s text-neutral-7">{m.keys_empty()}</p>;

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{m.key_name()}</TableHead>
            <TableHead>{m.key_start()}</TableHead>
            <TableHead>{m.key_created()}</TableHead>
            <TableHead>{m.last_used()}</TableHead>
            <TableHead>{m.state()}</TableHead>
            {!readOnly && (
              <TableHead>
                <span className="sr-only">{m.actions()}</span>
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {keys
            ? keys.map((key) => (
                <TableRow key={key.id}>
                  <TableCell className="max-w-64 truncate font-medium">{key.name}</TableCell>
                  <TableCell className="font-mono text-neutral-7">{key.prefix}…</TableCell>
                  <TableCell className="whitespace-nowrap text-neutral-7">
                    {formatDate(key.createdAt)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-neutral-7">
                    {key.lastUsedAt ? formatAgo(key.lastUsedAt, now) : m.never()}
                  </TableCell>
                  <TableCell>
                    {key.revokedAt ? (
                      <Badge>{m.key_revoked()}</Badge>
                    ) : suspended ? (
                      <Badge variant="warning">{m.developer_suspended()}</Badge>
                    ) : (
                      <Badge variant="success">{m.key_working()}</Badge>
                    )}
                  </TableCell>
                  {!readOnly && (
                    <TableCell className="text-right">
                      {!key.revokedAt && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setRevoking(key);
                            setAsking(true);
                          }}
                        >
                          {m.key_revoke()}
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))
            : [0, 1].map((row) => (
                <TableRow key={row}>
                  <TableCell colSpan={readOnly ? 5 : 6}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))}
        </TableBody>
      </Table>
      {!readOnly && (
        <ConfirmDialog
          open={asking}
          onOpenChange={setAsking}
          title={m.key_revoke_title({ name: revoking?.name ?? "" })}
          body={m.key_revoke_body()}
          confirmLabel={m.key_revoke()}
          onConfirm={() => (revoking ? revoke.mutateAsync(revoking.id) : Promise.resolve())}
        />
      )}
    </>
  );
}
