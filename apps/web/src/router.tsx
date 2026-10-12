import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";

import Loader from "./components/loader";
import { deLocalizeUrl, localizeUrl } from "./paraglide/runtime.js";
import { routeTree } from "./routeTree.gen";
import { createQueryClient, orpc } from "./utils/orpc";

export const getRouter = () => {
  // The product's route asks again who it takes, and shows what it asks for: decision 039.
  const queryClient = createQueryClient({ onClosedToVisitors: () => void router.invalidate() });

  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    // Routes are written once, without a locale. Paraglide adds and removes the /fr prefix.
    rewrite: {
      input: ({ url }) => deLocalizeUrl(url),
      output: ({ url }) => localizeUrl(url),
    },
    defaultPreloadStaleTime: 0,
    context: { orpc, queryClient },
    defaultPendingComponent: () => <Loader />,
    defaultNotFoundComponent: () => <div>Not Found</div>,
  });

  setupRouterSsrQueryIntegration({
    router,
    queryClient,
  });

  return router;
};

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
