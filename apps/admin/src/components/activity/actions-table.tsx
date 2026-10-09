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
  // Without it, the table is one account's own and names none.
  existing?: ReadonlySet<string>;
  // Set on the page of an account that signs in: a record that names a developer account as
  // well, as that of a member does, says which. Elsewhere it says which account.
  own?: "account";
  // What to say when nothing was done.
  empty: string;
};

const limitOf = (calls: number | null) =>
  calls === null ? m.developer_no_limit() : formatCount(calls);

/** What a record says was done, one line for each thing it changed. */
function sentences(action: OperatorAction, own?: "account"): string[] {
  const key = { name: action.keyName ?? "" };
  // A record of a member names two: the developer account and the account. The page of one
  // says the other. The account has the name it has now, and none once it is deleted.
  const member = { name: action.accountName ?? m.action_account_gone() };
  const developer = { developer: action.developerName ?? "" };
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
    case "developer.member_add":
      return [
        own === "account" ? m.action_member_added_to(developer) : m.action_member_added(member),
      ];
    case "developer.member_remove":
      return [
        own === "account"
          ? m.action_member_removed_from(developer)
          : m.action_member_removed(member),
      ];
    case "key.create":
      return [m.action_key_made(key)];
    case "key.revoke":
      return [m.action_key_revoked(key)];
    case "account.sign_out":
      return [m.action_signed_out({ count: formatCount(action.changes?.sessions ?? 0) })];
    case "account.suspend":
      return [m.action_suspended()];
    case "account.resume":
      return [m.action_account_resumed()];
    // An API of a later version records what this admin has no words for yet.
    default:
      return [m.action_unknown({ action: action.action })];
  }
}

const linked = "focus-ring rounded-(--radius-xs) underline-offset-4 outline-none hover:underline";

/**
 * What an action was done to: a developer account, or an account, each a link while it exists.
 * A record of a member names both: the developer account is here, and the sentence names the
 * account.
 */
function Subject({ action, existing }: { action: OperatorAction; existing: ReadonlySet<string> }) {
  if (action.accountId !== null && action.developerId === null) {
    // The record keeps an account's identifier alone: its name is the one it has now.
    return action.accountName === null ? (
      <span className="text-neutral-7">{m.action_operator_gone()}</span>
    ) : (
      <Link to="/accounts/$accountId" params={{ accountId: action.accountId }} className={linked}>
        {action.accountName}
      </Link>
    );
  }
  if (action.developerId !== null && existing.has(action.developerId)) {
    return (
      <Link
        to="/developers/$developerId"
        params={{ developerId: action.developerId }}
        className={linked}
      >
        {action.developerName}
      </Link>
    );
  }
  return action.developerName ?? <span className="text-neutral-7">{m.usage_no_developer()}</span>;
}

/** What the operators did, the latest first: when, who, to which account, and what. */
export function ActionsTable({ actions, existing, own, empty }: ActionsTableProps) {
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
                    <Subject action={action} existing={existing} />
                  </TableCell>
                )}
                <TableCell>
                  {sentences(action, own).map((sentence) => (
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
