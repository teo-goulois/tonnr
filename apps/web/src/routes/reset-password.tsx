import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { ResetPasswordPage } from "@/components/auth/reset-password-page";
import { AppShell } from "@/components/shared/app-shell";
import { authClient } from "@/lib/auth-client";
import { m } from "@/paraglide/messages.js";

export const Route = createFileRoute("/reset-password")({
  // The token the mail's link carries. A link with none is one that does not work.
  validateSearch: z.object({ token: z.coerce.string().optional().catch(undefined) }),
  // The address carries the token: no search engine lists it, and no other site is told it.
  head: () => ({
    meta: [
      { name: "robots", content: "noindex" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const { token } = Route.useSearch();
  const navigate = useNavigate();
  const [spent, setSpent] = useState(false);

  // The new password closes every session of the account, this browser's too: it signs in again.
  // A password the API finds too short is said under its field, and the other refusals in a toast.
  async function reset(newPassword: string) {
    if (!token) return undefined;
    const answer = await authClient.resetPassword({ newPassword, token });
    if (!answer.error) {
      toast.success(m.reset_done());
      await navigate({ to: "/login" });
      return undefined;
    }
    if (answer.error.code === "INVALID_TOKEN" || answer.error.code === "USER_NOT_FOUND") {
      setSpent(true);
      return undefined;
    }
    if (answer.error.code === "PASSWORD_TOO_SHORT") return m.auth_password_too_short();
    toast.error(m.auth_failed());
    return undefined;
  }

  return (
    <AppShell>
      <ResetPasswordPage isValid={Boolean(token) && !spent} onReset={reset} />
    </AppShell>
  );
}
