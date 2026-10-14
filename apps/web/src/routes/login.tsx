import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { AuthForm, type AuthMode } from "@/components/auth/auth-form";
import { Analytics } from "@/components/shared/analytics";
import { authClient } from "@/lib/auth-client";
import { authReturnTo } from "@/lib/google-auth";
import { AppShell } from "@/components/shared/app-shell";
import { m } from "@/paraglide/messages.js";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { error?: string; returnTo?: string } => ({
    error: typeof search.error === "string" ? search.error : undefined,
    returnTo: authReturnTo(search.returnTo),
  }),
  component: RouteComponent,
});

function RouteComponent() {
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const navigate = useNavigate();
  const session = authClient.useSession();
  const { error, returnTo } = Route.useSearch();

  return (
    <AppShell>
      <Analytics
        account={session.data?.user.id}
        isReady={!session.isPending}
        recordActivity={false}
      />
      <main className="mx-auto grid w-full max-w-(--container-sm) content-start gap-l px-m py-xl">
        <h1 className="text-l font-medium">
          {mode === "sign-up" ? m.auth_create_account() : m.auth_sign_in()}
        </h1>
        {error && (
          <p role="alert" className="text-s text-error">
            {error === "access_denied"
              ? m.auth_google_cancelled()
              : error === "email_not_verified" || error === "account_not_linked"
                ? m.auth_google_link_failed()
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
      </main>
    </AppShell>
  );
}
