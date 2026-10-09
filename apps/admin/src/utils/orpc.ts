import { createORPCClient, ORPCError } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { QueryCache, QueryClient } from "@tanstack/react-query";
import type { AppRouterClient } from "@repo/api/routers/index";
import { toast } from "sonner";

import { m } from "@/paraglide/messages.js";

import { ENV } from "../env.public";

/**
 * No answer came back from the API, or none this page may read. A browser gives the same failure
 * for an API that is stopped and for one that does not name this app's address, and gives a
 * fault of the page's own code the same kind of error: this one is the API's alone.
 */
export class ApiUnreachableError extends Error {
  constructor(cause: unknown) {
    super("The API did not answer", { cause });
    this.name = "ApiUnreachableError";
  }
}

/** Whether the API refused the caller: no session, or no right to what was asked. */
export function isRefusal(error: unknown) {
  return error instanceof ORPCError && ["UNAUTHORIZED", "FORBIDDEN"].includes(error.code);
}

/**
 * `onRefused` is told when the API refuses the caller while a page is open: the session ended,
 * or the account no longer runs the instance. Asking again would be refused again.
 */
export function createQueryClient(onRefused: () => void = () => {}) {
  const queryClient: QueryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        // A screen that says itself what it could not load asks for no toast.
        if (query.meta?.quiet) return;
        if (isRefusal(error)) {
          onRefused();
          // A session that ended goes to the sign-in. An account the API still knows is told
          // why, once: an operator is refused when the API does not name this app's address.
          if (error instanceof ORPCError && error.code === "FORBIDDEN") {
            toast.error(m.load_failed({ reason: error.message }), { id: "refused" });
          }
          return;
        }
        toast.error(m.load_failed({ reason: error.message }), {
          action: {
            label: m.retry(),
            // Marking it stale would wait for something else to ask again.
            onClick: () => {
              void queryClient.refetchQueries({ queryKey: query.queryKey, exact: true });
            },
          },
        });
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000,
        retry: (failures, error) => !isRefusal(error) && failures < 2,
      },
    },
  });
  return queryClient;
}

const link = new RPCLink({
  url: `${ENV.VITE_SERVER_URL.replace(/\/$/, "")}/rpc`,
  fetch(url, options) {
    return fetch(url, {
      ...options,
      // The session's cookie belongs to the API's address, not to this app's.
      credentials: "include",
    }).catch((error: unknown) => {
      // A call that was given up, as a screen that closes gives up its own, is no failure.
      if (error instanceof Error && error.name === "AbortError") throw error;
      throw new ApiUnreachableError(error);
    });
  },
});

export const client: AppRouterClient = createORPCClient(link);

export const orpc = createTanstackQueryUtils(client);

/**
 * After a change: the developer accounts, their keys and the record of what was done are asked
 * again. A change to one shows in the others: a key in its account's count, each of them in
 * the record.
 */
export function refreshLists(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: orpc.v1.developers.key() }),
    queryClient.invalidateQueries({ queryKey: orpc.v1.keys.key() }),
    queryClient.invalidateQueries({ queryKey: orpc.v1.actions.key() }),
  ]);
}
