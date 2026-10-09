import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { useAuthPrompt } from "@/components/auth/auth-prompt";
import { useOwnAccount } from "@/components/auth/use-own-account";
import { useSendVerification } from "@/components/auth/use-send-verification";
import { VerifiedPage, verifiedOutcome } from "@/components/auth/verified-page";
import { AppShell } from "@/components/shared/app-shell";
import { m } from "@/paraglide/messages.js";

export const Route = createFileRoute("/verified")({
  // The API writes a word here when the link did not work. Anything else that is written there
  // is read as a word the page does not know, or as a link that does not work when it cannot be
  // read as a word at all.
  validateSearch: z.object({ error: z.coerce.string().optional().catch("INVALID_TOKEN") }),
  // What the page shows depends on the browser's session, which the server does not have.
  ssr: false,
  component: Verified,
});

function Verified() {
  return (
    <AppShell>
      <Landing />
    </AppShell>
  );
}

// Inside the shell, which holds the dialog that signs in.
function Landing() {
  const { error } = Route.useSearch();
  const { signedIn, account, isPending, retry, isRetrying } = useOwnAccount();
  const { send, isSending } = useSendVerification();
  const promptAuth = useAuthPrompt();
  const outcome = verifiedOutcome(error, account, signedIn);
  // A link that failed is why the reader signs in: for a new mail.
  const reason = outcome === "followed" ? undefined : m.verify_sign_in_to_send();

  return (
    <VerifiedPage
      outcome={outcome}
      signedIn={isPending ? undefined : signedIn}
      canSend={account?.checksAddresses === true && !account.emailVerified}
      isSending={isSending}
      onSend={send}
      isRetrying={isRetrying}
      onRetry={retry}
      // Signed in here, the page tells the account about its own address, and offers the mail.
      onSignIn={() => promptAuth({ mode: "sign-in", reason })}
      onCreateAccount={() => promptAuth({ mode: "sign-up" })}
    />
  );
}
