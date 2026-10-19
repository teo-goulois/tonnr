import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { AuthForm, type AuthMode } from "@/components/auth/auth-form";
import { Analytics } from "@/components/shared/analytics";
import { authClient } from "@/lib/auth-client";
import { authReturnTo, isProvider, type Provider } from "@/lib/provider-auth";
import { AppShell } from "@/components/shared/app-shell";
import { m } from "@/paraglide/messages.js";
import { PageColumn } from "@/components/shared/page-column";

export const Route = createFileRoute("/login")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { error?: string; returnTo?: string; with?: Provider } => ({
    error: typeof search.error === "string" ? search.error : undefined,
    returnTo: authReturnTo(search.returnTo),
    // The provider a refusal came back from, which its words name.
    with: isProvider(search.with) ? search.with : undefined,
  }),
  component: RouteComponent,
});

function RouteComponent() {
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const navigate = useNavigate();
  const session = authClient.useSession();
  const { error, returnTo, with: provider } = Route.useSearch();
  const apple = provider === "apple";

  return (
    <AppShell>
      <Analytics
        account={session.data?.user.id}
        isReady={!session.isPending}
        recordActivity={false}
      />
      <PageColumn>
        <h1 className="text-l font-medium">
          {mode === "sign-up" ? m.auth_create_account() : m.auth_sign_in()}
        </h1>
        {error && (
          <p role="alert" className="text-s text-error">
            {/* Google says a sign-in was cancelled with `access_denied`, Apple with its own word. */}
            {error === "access_denied" || error === "user_cancelled_authorize"
              ? apple
                ? m.auth_apple_cancelled()
                : m.auth_google_cancelled()
              : error === "email_not_verified" || error === "account_not_linked"
                ? apple
                  ? m.auth_apple_link_failed()
                  : m.auth_google_link_failed()
                : error === "ACCOUNT_SUSPENDED"
                  ? m.auth_suspended()
                  : m.auth_failed()}
          </p>
        )}
        <AuthForm
          mode={mode}
          onModeChange={setMode}
          returnTo={returnTo}
          onSuccess={() => void navigate({ href: returnTo ?? "/app" })}
        />
      </PageColumn>
    </AppShell>
  );
}
