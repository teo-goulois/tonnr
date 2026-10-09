import { ORPCError } from "@orpc/client";
import { useQuery } from "@tanstack/react-query";
import { Outlet, createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";

import { NotOperator } from "@/components/auth/not-operator";
import { AdminShell } from "@/components/shared/admin-shell";
import { Loader } from "@/components/shared/loader";
import { pageOf } from "@/lib/page";
import { isRefusal, orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_operator")({
  // The session's cookie belongs to the browser: the server that renders has none to send.
  ssr: false,
  // The API says who is signed in, and whether that account runs the instance. It is the API
  // that keeps anyone else out: this only chooses what to show.
  beforeLoad: async ({ context, location }) => {
    try {
      const account = await context.queryClient.fetchQuery(
        context.orpc.v1.account.get.queryOptions({ staleTime: 30 * 1000, meta: { quiet: true } }),
      );
      return { account };
    } catch (error) {
      if (error instanceof ORPCError && error.code === "UNAUTHORIZED") {
        // The page that was asked for is where the sign-in leads back to.
        const asked = pageOf(location.href);
        throw redirect({ to: "/login", search: asked === "/" ? {} : { to: asked } });
      }
      throw error;
    }
  },
  component: OperatorLayout,
});

// How often an open page asks whether its account is still signed in and still an operator.
const EVERY = 60 * 1000;

function OperatorLayout() {
  const context = Route.useRouteContext();
  const router = useRouter();
  // A page left open asks nothing of its own, such as the list of accounts. This does, so that
  // a session that ended or rights that went do not leave their data on screen.
  const asked = useQuery(
    orpc.v1.account.get.queryOptions({ refetchInterval: EVERY, meta: { quiet: true } }),
  );
  const refused = isRefusal(asked.error);
  useEffect(() => {
    // The guard above asks again, and sends the account to the sign-in.
    if (refused) void router.invalidate();
  }, [refused, router]);

  const account = asked.data ?? context.account;
  if (refused) return <Loader />;
  if (!account.isOperator) return <NotOperator account={account} />;
  return (
    <AdminShell account={account}>
      <Outlet />
    </AdminShell>
  );
}
