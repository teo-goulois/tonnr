import { ORPCError } from "@orpc/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";

import { AccountPage } from "@/components/accounts/account-page";
import { ActionsTable } from "@/components/activity/actions-table";
import { Loader } from "@/components/shared/loader";
import { NotFound } from "@/components/shared/not-found";
import { useNow } from "@/lib/use-now";
import { m } from "@/paraglide/messages.js";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_operator/accounts/$accountId")({
  component: AccountRoute,
});

const EVERY = 30 * 1000;

function AccountRoute() {
  const { accountId } = Route.useParams();
  // A screen of its own for each account: what was loaded for one is not drawn for another.
  return <AccountScreen key={accountId} accountId={accountId} />;
}

function AccountScreen({ accountId }: { accountId: string }) {
  const { account: reader } = Route.useRouteContext();
  const router = useRouter();
  const queryClient = useQueryClient();
  const now = useNow();

  const account = useQuery(
    orpc.v1.accounts.get.queryOptions({
      input: { id: accountId },
      refetchInterval: EVERY,
      // An account that does not exist is not asked for again.
      retry: (count, error) => !isMissing(error) && count < 2,
    }),
  );
  // What was done to the account, the latest first. The page of the activity has all of it.
  const history = useQuery(orpc.v1.actions.list.queryOptions({ input: { accountId, limit: 20 } }));

  if (isMissing(account.error)) return <NotFound />;
  if (!account.data) return <Loader />;

  return (
    <AccountPage
      account={account.data}
      isOwn={account.data.id === reader.id}
      now={now.getTime()}
      onSignedOut={() => {
        // The session this page was read with is closed: nothing it loaded stays on screen,
        // and the guard sends the reader to the sign-in.
        queryClient.clear();
        void router.invalidate();
      }}
    >
      <section className="grid grid-cols-1 gap-s">
        <h2 className="text-m font-medium">{m.account_history()}</h2>
        <ActionsTable actions={history.data?.actions} empty={m.account_history_empty()} />
      </section>
    </AccountPage>
  );
}

function isMissing(error: unknown) {
  return error instanceof ORPCError && error.code === "NOT_FOUND";
}
