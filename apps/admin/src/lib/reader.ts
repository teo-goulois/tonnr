import type { Query, QueryClient, QueryFilters } from "@tanstack/react-query";

// Whose answers each client keeps in memory. The session is a cookie of the API's, and the
// browser's: an account signs out in another tab, of this app or of the web app, and another
// signs in. What this tab loaded was the first one's to read, and nothing says so in its keys.
const readers = new WeakMap<QueryClient, string>();

/**
 * Told who is signed in, each time the API says it. When it is no longer the account whose
 * answers are kept, they are dropped: what no screen draws is deleted, and what a screen still
 * draws is emptied under it and asked again. `who` names the queries that say who is signed
 * in, which are the new reader's already.
 */
export function readBy(queryClient: QueryClient, accountId: string, who: QueryFilters) {
  const before = readers.get(queryClient);
  readers.set(queryClient, accountId);
  if (before === undefined || before === accountId) return;

  const kept = new Set<Query>(queryClient.getQueryCache().findAll(who));
  const others = { predicate: (query: Query) => !kept.has(query) };
  // A request that left for the reader before is given up: its answer is not this one's.
  void queryClient.cancelQueries(others);
  queryClient.removeQueries({ ...others, type: "inactive" });
  void queryClient.resetQueries({ ...others, type: "active" });
  queryClient.getMutationCache().clear();
}

/** Told that no one is signed in any more: nothing that was loaded outlives the session. */
export function readByNoOne(queryClient: QueryClient) {
  readers.delete(queryClient);
  queryClient.clear();
}

/** The developer account a query asked about, when its input names one. */
function developerOf(query: Query) {
  const asked = query.queryKey[1] as { input?: { developerId?: unknown } } | undefined;
  return asked?.input?.developerId;
}

/**
 * Drops what the console read of the developer accounts that are no longer the reader's: an
 * operator took it out of their members, or deleted them. `calls` names the queries that read
 * a developer account's calls, and `members` the developer accounts the reader still has.
 */
export function forgetCallsOfOthers(
  queryClient: QueryClient,
  calls: QueryFilters[],
  members: ReadonlySet<string>,
) {
  for (const filter of calls) {
    // Deleting a query gives up the request it has under way.
    queryClient.removeQueries({
      ...filter,
      predicate: (query) => {
        const developerId = developerOf(query);
        return typeof developerId !== "string" || !members.has(developerId);
      },
    });
  }
}
