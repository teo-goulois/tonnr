import { Badge } from "@repo/ui/components/ui/badge";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
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

import type { Account } from "@/lib/api";
import { formatCount, formatDate } from "@/lib/format";
import { m } from "@/paraglide/messages.js";

type AccountsPageProps = {
  // Undefined while the first page loads.
  accounts: Account[] | undefined;
  // How many accounts there are, or how many match the search.
  total: number | undefined;
  search: string;
  onSearch: (search: string) => void;
  // Set when more accounts follow those on screen.
  onMore?: () => void;
  isLoadingMore: boolean;
};

/** The accounts that signed up, the newest first. Each leads to its page. */
export function AccountsPage({
  accounts,
  total,
  search,
  onSearch,
  onMore,
  isLoadingMore,
}: AccountsPageProps) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-s">
        <div className="flex items-baseline gap-s">
          <h1 className="text-l font-medium">{m.nav_accounts()}</h1>
          {total !== undefined && (
            <span className="text-neutral-7 tabular-nums">{formatCount(total)}</span>
          )}
        </div>
        <div className="w-full sm:w-72">
          <Input
            type="search"
            aria-label={m.accounts_search()}
            placeholder={m.accounts_search()}
            autoComplete="off"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
          />
        </div>
      </div>

      {accounts?.length === 0 ? (
        <p className="text-neutral-7">{search ? m.accounts_none_found() : m.accounts_empty()}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{m.account_name()}</TableHead>
              <TableHead>{m.auth_email()}</TableHead>
              <TableHead>{m.account_created()}</TableHead>
              <TableHead>
                <span className="sr-only">{m.account_role()}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts
              ? accounts.map((account) => (
                  <TableRow key={account.id}>
                    <TableCell className="max-w-64 truncate font-medium">
                      <Link
                        to="/accounts/$accountId"
                        params={{ accountId: account.id }}
                        className="focus-ring rounded-(--radius-xs) underline-offset-4 outline-none hover:underline"
                      >
                        {account.name}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-72 truncate text-neutral-7">
                      {account.email}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-neutral-7">
                      {formatDate(account.createdAt)}
                    </TableCell>
                    <TableCell>
                      <span className="flex flex-wrap gap-xs">
                        {account.isOperator && <Badge>{m.account_operator()}</Badge>}
                        {account.suspendedAt && (
                          <Badge variant="warning">{m.account_suspended()}</Badge>
                        )}
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              : [0, 1, 2].map((row) => (
                  <TableRow key={row}>
                    <TableCell colSpan={4}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      )}

      {onMore && (
        <div>
          <Button variant="outline" isPending={isLoadingMore} onClick={onMore}>
            {m.accounts_more()}
          </Button>
        </div>
      )}
    </>
  );
}
