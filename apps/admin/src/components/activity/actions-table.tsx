import { Skeleton } from "@repo/ui/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/ui/table";
import { Link } from "@tanstack/react-router";

import type { OperatorAction } from "@/lib/api";
import { formatCount, formatDayAndHour } from "@/lib/format";
import { m } from "@/paraglide/messages.js";

type ActionsTableProps = {
  // Undefined while they load.
  actions: OperatorAction[] | undefined;
  // The developer accounts that still exist: a record of one that was deleted is not a link.
  // Without it, the table is one account's own and names no account.
  existing?: ReadonlySet<string>;
  // What to say when nothing was done.
  empty: string;
};

const limitOf = (calls: number | null) =>
  calls === null ? m.developer_no_limit() : formatCount(calls);

/** What a record says was done, one line for each thing it changed. */
function sentences(action: OperatorAction): string[] {
  const key = { name: action.keyName ?? "" };
  switch (action.action) {
    case "developer.create": {
      const limit = action.changes?.callsPerHour;
      return [
        limit
          ? m.action_developer_created_with({ limit: limitOf(limit.to) })
          : m.action_developer_created(),
      ];
    }
    case "developer.update": {
      const { name, callsPerHour, contact, note } = action.changes ?? {};
      return [
        ...(name ? [m.action_renamed(name)] : []),
        ...(callsPerHour
          ? [m.action_limit({ from: limitOf(callsPerHour.from), to: limitOf(callsPerHour.to) })]
          : []),
        ...(contact ? [m.action_contact()] : []),
        ...(note ? [m.action_note()] : []),
      ];
    }
    case "developer.suspend":
      return [m.action_suspended()];
    case "developer.resume":
      return [m.action_resumed()];
    case "developer.delete":
      return [m.action_deleted()];
    case "key.create":
      return [m.action_key_made(key)];
    case "key.revoke":
      return [m.action_key_revoked(key)];
  }
}

/** What the operators did, the latest first: when, who, to which account, and what. */
export function ActionsTable({ actions, existing, empty }: ActionsTableProps) {
  if (actions?.length === 0) return <p className="text-s text-neutral-7">{empty}</p>;
  const columns = existing ? 4 : 3;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{m.action_when()}</TableHead>
          <TableHead>{m.action_who()}</TableHead>
          {existing && <TableHead>{m.action_account()}</TableHead>}
          <TableHead>{m.action_what()}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {actions
          ? actions.map((action) => (
              <TableRow key={action.id}>
                <TableCell className="whitespace-nowrap text-neutral-7">
                  {formatDayAndHour(action.at)}
                </TableCell>
                <TableCell className="max-w-48 truncate">
                  {action.operatorName ?? (
                    <span className="text-neutral-7">{m.action_operator_gone()}</span>
                  )}
                </TableCell>
                {existing && (
                  <TableCell className="max-w-56 truncate">
                    {action.developerId !== null && existing.has(action.developerId) ? (
                      <Link
                        to="/developers/$developerId"
                        params={{ developerId: action.developerId }}
                        className="focus-ring rounded-(--radius-xs) underline-offset-4 outline-none hover:underline"
                      >
                        {action.developerName}
                      </Link>
                    ) : (
                      (action.developerName ?? (
                        <span className="text-neutral-7">{m.usage_no_developer()}</span>
                      ))
                    )}
                  </TableCell>
                )}
                <TableCell>
                  {sentences(action).map((sentence) => (
                    <p key={sentence}>{sentence}</p>
                  ))}
                </TableCell>
              </TableRow>
            ))
          : [0, 1, 2].map((row) => (
              <TableRow key={row}>
                <TableCell colSpan={columns}>
                  <Skeleton className="h-5 w-full" />
                </TableCell>
              </TableRow>
            ))}
      </TableBody>
    </Table>
  );
}
