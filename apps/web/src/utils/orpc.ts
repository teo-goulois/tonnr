import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { QueryCache, QueryClient } from "@tanstack/react-query";
import type { AppRouterClient } from "@repo/api/routers/index";
import { toast } from "sonner";

import { ENV } from "../env.public";
import { analyticsHeaders } from "../lib/analytics";
import { linkAuthorization } from "../lib/shared-link";
import { isClosedToVisitors } from "../lib/visitors";

type Events = {
  // The API refused a visitor it answered before: the instance was closed to them since.
  onClosedToVisitors?: () => void;
};

export function createQueryClient({ onClosedToVisitors }: Events = {}) {
  const queryClient: QueryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        // Whatever the visitor was reading, the product asks for an account in its place. Every
        // query of the map is refused together: the first one says so, once.
        if (isClosedToVisitors(error)) {
          const key = orpc.v1.visitors.get.queryKey();
          if (queryClient.getQueryData(key)?.open === false) return;
          queryClient.setQueryData(key, { open: false });
          onClosedToVisitors?.();
          return;
        }
        // A screen that says itself what it could not load asks for no toast.
        if (query.meta?.quiet) return;
        toast.error(`Error: ${error.message}`, {
          action: {
            label: "retry",
            onClick: () => {
              query.invalidate();
            },
          },
        });
      },
    }),
    defaultOptions: { queries: { staleTime: 60 * 1000 } },
  });
  return queryClient;
}

const link = new RPCLink({
  url: `${ENV.VITE_SERVER_URL.replace(/\/$/, "")}/rpc`,
  // A visitor who reads a shared list is known by its link, where an account is by its cookie.
  headers: () => {
    const authorization = linkAuthorization();
    return { ...analyticsHeaders(), ...(authorization ? { authorization } : {}) };
  },
  fetch(url, options) {
    return fetch(url, {
      ...options,
      credentials: "include",
    });
  },
});

export const client: AppRouterClient = createORPCClient(link);

export const orpc = createTanstackQueryUtils(client);
