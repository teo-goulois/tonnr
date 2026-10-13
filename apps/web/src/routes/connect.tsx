import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import type { AuthMode } from "@/components/auth/auth-form";
import { ConnectPage } from "@/components/auth/connect-page";
import { AppShell } from "@/components/shared/app-shell";
import { answer, askedAtStart, clientOf, continueAddress } from "@/lib/agent-sign-in";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/connect")({
  // The address carries what the API signed for one account's browser: no search engine lists
  // it, and no other site is told it.
  head: () => ({
    meta: [
      { name: "robots", content: "noindex" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  // What the page shows depends on the browser's session, which the server does not have.
  ssr: false,
  component: Connect,
});

function Connect() {
  return (
    <AppShell>
      <Asking />
    </AppShell>
  );
}

function Asking() {
  const asked = askedAtStart();
  const session = authClient.useSession();
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const account = session.data?.user;

  // What the assistant named itself, which the API says to an account that is signed in.
  const client = useQuery({
    queryKey: ["agent-client", asked?.clientId, account?.id],
    queryFn: () => clientOf(asked as NonNullable<typeof asked>),
    enabled: asked !== null && account !== undefined,
    retry: false,
    staleTime: Infinity,
    meta: { quiet: true },
  });
  // The answer leaves with the browser: the API says where the assistant waits for it.
  const answering = useMutation({
    mutationFn: (accept: boolean) => answer(asked as NonNullable<typeof asked>, accept),
    onSuccess: (address) => window.location.assign(address),
  });

  if (!asked) return <ConnectPage state="nothing" />;
  if (session.isPending) return <ConnectPage state="waiting" />;
  if (!account) {
    return (
      <ConnectPage
        state="sign-in"
        mode={mode}
        onModeChange={setMode}
        onSignedIn={() => window.location.assign(continueAddress(asked))}
      />
    );
  }

  return (
    <ConnectPage
      state="asking"
      client={client.data}
      username={(account as { username?: string | null }).username ?? null}
      returnsTo={asked.returnsTo}
      // The browser is on its way once the API has answered.
      isAnswering={answering.isPending || answering.isSuccess}
      failed={client.isError || answering.isError}
      onAllow={() => answering.mutate(true)}
      onDeny={() => answering.mutate(false)}
    />
  );
}
