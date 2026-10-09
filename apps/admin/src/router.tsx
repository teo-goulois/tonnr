import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";

import { ErrorScreen } from "./components/shared/error-screen";
import { Loader } from "./components/shared/loader";
import { NotFound } from "./components/shared/not-found";
import { routeTree } from "./routeTree.gen";
import { createQueryClient, orpc } from "./utils/orpc";

export const getRouter = () => {
  // The guard of the operator's pages asks the API again who is signed in: it sends an account
  // that is no longer signed in to the sign-in, and shows one that lost its rights why.
  const queryClient = createQueryClient(() => {
    void queryClient.invalidateQueries({ queryKey: orpc.v1.account.key() });
    void router.invalidate();
  });

  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    context: { orpc, queryClient },
    defaultPendingComponent: Loader,
    defaultNotFoundComponent: NotFound,
    defaultErrorComponent: ErrorScreen,
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
