import { useQuery } from "@tanstack/react-query";
import { Outlet, createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";

import { AdminShell } from "@/components/shared/admin-shell";
import { Loader } from "@/components/shared/loader";
import { signedIn } from "@/lib/guard";
import { isRefusal, orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_operator")({
  // The session's cookie belongs to the browser: the server that renders has none to send.
  ssr: false,
  // The API says who is signed in, and whether that account runs the instance.
  beforeLoad: async ({ context, location }) => {
    const account = await signedIn(context, location.href);
    // An account that does not run the instance has the console, whatever page it asked for:
    // decision 027. None of the operator's screens is drawn for it.
    if (!account.isOperator) throw redirect({ to: "/console" });
    return { account };
  },
  component: OperatorLayout,
});

// How often an open page asks whether its account is still signed in and still an operator.
const EVERY = 60 * 1000;

function OperatorLayout() {
  const context = Route.useRouteContext();
  const router = useRouter();
  // A page left open asks nothing of its own, such as the list of accounts. This does, so that
  // a session that ended or rights that went do not leave their data on screen. It asks again
  // each time the reader comes back to the tab: the session may have changed in another.
  const asked = useQuery(
    orpc.v1.account.get.queryOptions({
      refetchInterval: EVERY,
      refetchOnWindowFocus: "always",
      meta: { quiet: true },
    }),
  );
  const account = asked.data ?? context.account;
  // The guard above asks again: it sends an account that is no longer signed in to the
  // sign-in, and one that no longer runs the instance to the console. It is also the guard
  // that drops what the page loaded for an account when another one is signed in.
  const leaving =
    isRefusal(asked.error) || !account.isOperator || account.id !== context.account.id;
  useEffect(() => {
    if (leaving) void router.invalidate();
  }, [leaving, router]);

  // Nothing is drawn meanwhile: the screens of the account before are taken down first.
  if (leaving) return <Loader />;
  return (
    <AdminShell account={account}>
      <Outlet />
    </AdminShell>
  );
}
