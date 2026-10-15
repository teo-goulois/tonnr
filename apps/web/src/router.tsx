import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";

import Loader from "./components/loader";
import { reportError } from "./lib/analytics";
import { authClient } from "./lib/auth-client";
import { forgetSession } from "./lib/session-query";
import { deLocalizeUrl, localizeUrl } from "./paraglide/runtime.js";
import { routeTree } from "./routeTree.gen";
import { createQueryClient, orpc } from "./utils/orpc";

export const getRouter = () => {
  // The product's route asks again who it takes, and shows what it asks for: decision 039.
  const queryClient = createQueryClient({ onClosedToVisitors: () => void router.invalidate() });
  // The session the product's route keeps is forgotten the moment someone signs in or out,
  // whichever form they did it from: the sign-in library says so to its listeners.
  authClient.$store.listen("$sessionSignal", () => void forgetSession(queryClient));

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
    // What a route's boundary caught never reaches the window: it is reported here, when the
    // product's pages are open with consent.
    defaultOnCatch: (error) => reportError(error),
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
