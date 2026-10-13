import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { AuthForm, type AuthMode } from "@/components/auth/auth-form";
import { Analytics } from "@/components/shared/analytics";
import { authClient } from "@/lib/auth-client";
import { AppShell } from "@/components/shared/app-shell";
import { m } from "@/paraglide/messages.js";

export const Route = createFileRoute("/login")({
  component: RouteComponent,
});

function RouteComponent() {
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const navigate = useNavigate();
  const session = authClient.useSession();

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
        <AuthForm
          mode={mode}
          onModeChange={setMode}
          onSuccess={() => void navigate({ to: "/app" })}
        />
      </main>
    </AppShell>
  );
}
