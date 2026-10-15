import { Outlet, createFileRoute, useRouter, useRouterState } from "@tanstack/react-router";

import { LoginWall } from "@/components/auth/login-wall";
import { Analytics } from "@/components/shared/analytics";
import { AppPending } from "@/components/shared/app-pending";
import { AppShell } from "@/components/shared/app-shell";
import { authClient } from "@/lib/auth-client";
import { sessionQuery } from "@/lib/session-query";
import { readWithoutLink } from "@/lib/shared-link";
import { orpc } from "@/utils/orpc";

const MINUTE_MS = 60 * 1000;

export const Route = createFileRoute("/app")({
  // The session's cookie belongs to the browser: the server that renders has none to send.
  ssr: false,
  component: AppLayout,
  // What the server sends in the product's place, and what a browser that comes from another
  // page shows at once: the bar and the map's place, until the API has answered. It is taken
  // away as soon as it has, with no time it must stay.
  pendingComponent: AppPending,
  pendingMs: 0,
  pendingMinMs: 0,
  // The product takes whoever comes: an account, the link of a shared list, which the API knows
  // its reader by (decision 035), or a visitor with neither, whom the API answers until an
  // operator closes the instance to them. The product then asks for an account in place of the
  // map: decision 039.
  beforeLoad: async ({ context, location }) => {
    const shared = (location.search as { shared?: unknown }).shared;
    // Whoever leaves a shared list for the whole map reads it as a visitor, not by the link.
    if (!shared) readWithoutLink();
    // Asked together, so that the page waits for the API once. The session is kept a minute:
    // a selection on the map is a navigation, and each one comes here.
    const [session, visitors] = await Promise.all([
      context.queryClient.fetchQuery(sessionQuery()),
      context.queryClient
        .fetchQuery(
          orpc.v1.visitors.get.queryOptions({
            // Open, it is asked again after a while and not at every move on the map: an
            // instance that closes meanwhile says so itself, in what it refuses. Closed, it is
            // asked at every move, so that the wall falls as soon as the instance opens.
            staleTime: (query) => (query.state.data?.open === false ? 0 : 5 * MINUTE_MS),
            meta: { quiet: true },
          }),
        )
        // An API that does not say is taken as open: the map says itself what it cannot load.
        .catch(() => ({ open: true })),
    ]);
    return { session, walled: !session.data && !shared && !visitors.open };
  },
});

function AppLayout() {
  const { walled } = Route.useRouteContext();
  const session = authClient.useSession();
  const router = useRouter();
  // The link someone gave the visitor, when the address names one: the wall takes it too.
  const invite = useRouterState({
    select: (state) => (state.location.search as { invite?: unknown }).invite,
  });

  return (
    // The wall leads nowhere but in: it has no bar of tabs.
    <AppShell nav={!walled}>
      <Analytics account={session.data?.user.id} isReady={!session.isPending} />
      {walled ? (
        <LoginWall
          onSignedIn={() => void router.invalidate()}
          invitation={typeof invite === "string" ? invite : undefined}
        />
      ) : (
        <Outlet />
      )}
    </AppShell>
  );
}
