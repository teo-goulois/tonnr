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
import { Link } from "@tanstack/react-router";

import type { Developer, Key } from "@/lib/api";
import { formatAgo } from "@/lib/format";
import { m } from "@/paraglide/messages.js";

import { CallsMeter } from "./calls-meter";
import { DeveloperFormDialog } from "./developer-form-dialog";
import { KeysTable } from "./keys-table";

type DevelopersPageProps = {
  // Undefined while they load.
  developers: Developer[] | undefined;
  // The keys that have no developer account: an older version of the instance made them.
  orphanKeys: Key[];
  now: number;
  // Whether the dialog that creates an account is open. The address holds it, so that the
  // command palette and its shortcut open it from any page.
  creating: boolean;
  onCreatingChange: (creating: boolean) => void;
  onCreated: (developer: Developer) => void;
};

/** The developer accounts of the instance, with what each one called this hour. */
export function DevelopersPage({
  developers,
  orphanKeys,
  now,
  creating,
  onCreatingChange,
  onCreated,
}: DevelopersPageProps) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-s">
        <h1 className="text-l font-medium">{m.nav_developers()}</h1>
        <Button onClick={() => onCreatingChange(true)}>
          <PlusIcon aria-hidden />
          {m.developer_new()}
        </Button>
      </div>

      {developers?.length === 0 ? (
        <p className="max-w-(--container-xl) text-neutral-7">{m.developers_empty()}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{m.developer_name()}</TableHead>
              <TableHead>{m.developer_contact()}</TableHead>
              <TableHead>{m.developer_calls_this_hour()}</TableHead>
              <TableHead className="text-right">{m.developer_keys()}</TableHead>
              <TableHead>{m.last_used()}</TableHead>
              <TableHead>{m.state()}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {developers
              ? developers.map((developer) => (
                  <TableRow key={developer.id}>
                    <TableCell className="max-w-64 truncate font-medium">
                      <Link
                        to="/developers/$developerId"
                        params={{ developerId: developer.id }}
                        className="focus-ring rounded-(--radius-xs) underline-offset-4 outline-none hover:underline"
                      >
                        {developer.name}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-56 truncate text-neutral-7">
                      {developer.contact}
                    </TableCell>
                    <TableCell>
                      <CallsMeter calls={developer.callsThisHour} limit={developer.callsPerHour} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{developer.keys}</TableCell>
                    <TableCell className="whitespace-nowrap text-neutral-7">
                      {developer.lastUsedAt ? formatAgo(developer.lastUsedAt, now) : m.never()}
                    </TableCell>
                    <TableCell>
                      {developer.suspendedAt ? (
                        <Badge variant="warning">{m.developer_suspended()}</Badge>
                      ) : (
                        <Badge variant="success">{m.developer_active()}</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              : [0, 1, 2].map((row) => (
                  <TableRow key={row}>
                    <TableCell colSpan={6}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      )}

      {orphanKeys.length > 0 && (
        <section className="grid grid-cols-1 gap-s">
          <div className="grid gap-xxs">
            <h2 className="text-m font-medium">{m.orphan_keys_title()}</h2>
            <p className="max-w-(--container-2xl) text-s text-neutral-7">{m.orphan_keys_body()}</p>
          </div>
          <KeysTable keys={orphanKeys} now={now} />
        </section>
      )}

      <DeveloperFormDialog open={creating} onOpenChange={onCreatingChange} onSaved={onCreated} />
    </>
  );
}
