import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AccountsPage } from "@/components/accounts/accounts-page";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_operator/accounts")({
  // What is searched for is in the address, so that going back finds it again.
  validateSearch: (search): { q?: string } => ({ q: searchOf(search.q) || undefined }),
  component: AccountsRoute,
});

// What an address searches for. An address typed by hand may hold a number there, which the
// router reads as one, and the router hands down what no route has checked.
function searchOf(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).trim().slice(0, 80);
}

function AccountsRoute() {
  const q = searchOf(Route.useSearch().q);
  const navigate = useNavigate({ from: Route.fullPath });
  // What is typed, which the address follows once the typing pauses.
  const [typed, setTyped] = useState(q);
  // And the other way: a search that the address changes, as going back does or the page's
  // link, is the one on screen. What is being typed is left alone when the address only
  // caught up with it.
  const [seen, setSeen] = useState(q);
  if (q !== seen) {
    setSeen(q);
    if (q !== typed.trim()) setTyped(q);
  }

  useEffect(() => {
    const wanted = typed.trim();
    if (wanted === q) return;
    const timer = setTimeout(
      () => void navigate({ search: wanted === "" ? {} : { q: wanted }, replace: true }),
      250,
    );
    return () => clearTimeout(timer);
  }, [typed, q, navigate]);

  const accounts = useInfiniteQuery(
    orpc.v1.accounts.list.infiniteOptions({
      input: (after: string | undefined) => ({ q: q === "" ? undefined : q, after }),
      initialPageParam: undefined,
      getNextPageParam: (page) => page.next ?? undefined,
      placeholderData: keepPreviousData,
    }),
  );

  return (
    <AccountsPage
      accounts={accounts.data?.pages.flatMap((page) => page.accounts)}
      total={accounts.data?.pages[0]?.total}
      search={typed}
      onSearch={setTyped}
      onMore={accounts.hasNextPage ? () => void accounts.fetchNextPage() : undefined}
      isLoadingMore={accounts.isFetchingNextPage}
    />
  );
}
