import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Outlet, createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";

import { NotOperator } from "@/components/auth/not-operator";
import { ConsoleShell } from "@/components/console/console-shell";
import { Loader } from "@/components/shared/loader";
import { signedIn } from "@/lib/guard";
import { forgetCallsOfOthers } from "@/lib/reader";
import { isMissing, isRefusal, orpc } from "@/utils/orpc";

// The console of decision 027: what an account that runs nothing reads here, of the developer
// accounts an operator made it a member of. It sits outside the operator's pages, so that none
// of their screens is ever drawn for it.
export const Route = createFileRoute("/console")({
  // The session's cookie belongs to the browser: the server that renders has none to send.
  ssr: false,
  beforeLoad: async ({ context, location }) => {
    const account = await signedIn(context, location.href);
    // An operator reads every developer account in the admin, a member of one or not.
    if (account.isOperator) throw redirect({ to: "/" });
    return { account };
  },
  component: ConsoleLayout,
});

// How often an open page asks whether its account is still signed in, and what it is a member
// of: an operator may take a developer account from it at any moment.
const EVERY = 30 * 1000;

function ConsoleLayout() {
  const context = Route.useRouteContext();
  const router = useRouter();
  const queryClient = useQueryClient();
  // It asks again each time the reader comes back to the tab: the session may have changed in
  // another.
  const asked = useQuery(
    orpc.v1.account.get.queryOptions({
      refetchInterval: EVERY,
      refetchOnWindowFocus: "always",
      meta: { quiet: true },
    }),
  );
  const mine = useQuery(
    orpc.v1.console.get.queryOptions({
      refetchInterval: EVERY,
      // An API of a version before the console has no such route: the screen says the rest.
      meta: { quietWhenMissing: true },
    }),
  );

  const account = asked.data ?? context.account;
  // The guard above asks again: it sends an account that is no longer signed in to the
  // sign-in, and one that was made an operator to the admin. It is also the guard that drops
  // what the page loaded for an account when another one is signed in.
  const leaving =
    isRefusal(asked.error) ||
    isRefusal(mine.error) ||
    account.isOperator ||
    account.id !== context.account.id;
  // Asked again each time either account changes: the one the API names may be yet another by
  // the time the guard has answered.
  const [named, held] = [account.id, context.account.id];
  useEffect(() => {
    if (leaving) void router.invalidate();
  }, [leaving, named, held, router]);

  // What was read of a developer account does not outlive the reader's place among its
  // members: taken out of one of several, of the last one, or the developer account deleted.
  const members = mine.data?.developers.map((developer) => developer.id).join(" ");
  useEffect(() => {
    if (members === undefined) return;
    forgetCallsOfOthers(
      queryClient,
      [{ queryKey: orpc.v1.console.series.key() }, { queryKey: orpc.v1.console.breakdown.key() }],
      new Set(members === "" ? [] : members.split(" ")),
    );
  }, [members, queryClient]);

  // Nothing is drawn meanwhile: the screens of the account before are taken down first.
  if (leaving) return <Loader />;
  // An API that knows no console gives no developer account to read.
  if (isMissing(mine.error)) return <NotOperator account={account} />;
  // An answer that did not come is not an empty list: the toast says what failed.
  if (!mine.data) return <Loader />;
  if (mine.data.developers.length === 0) return <NotOperator account={account} />;
  return (
    // The screens belong to the account they were drawn for. Another account gets new ones,
    // which have read nothing: see `readBy`.
    <ConsoleShell key={account.id} account={account} developers={mine.data.developers}>
      <Outlet />
    </ConsoleShell>
  );
}
