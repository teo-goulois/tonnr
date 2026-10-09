import { createORPCClient, ORPCError } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { QueryCache, QueryClient } from "@tanstack/react-query";
import type { AppRouterClient } from "@repo/api/routers/index";
import { toast } from "sonner";

import { m } from "@/paraglide/messages.js";

import { ENV } from "../env.public";

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
    });
  },
});

export const client: AppRouterClient = createORPCClient(link);

export const orpc = createTanstackQueryUtils(client);
