import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import {
  ForgotPasswordPage,
  type ForgotPasswordState,
} from "@/components/auth/forgot-password-page";
import { AppShell } from "@/components/shared/app-shell";
import { authClient } from "@/lib/auth-client";
import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  component: ForgotPassword,
});

function ForgotPassword() {
  const [state, setState] = useState<ForgotPasswordState>({ step: "asking" });

  // The mail is written in the language of the page, until the account's own is known: the
  // request names it as the language it asks for.
  async function ask(email: string) {
    const answer = await authClient.requestPasswordReset({
      email,
      fetchOptions: { headers: { "Accept-Language": getLocale() } },
    });
    if (!answer.error) return setState({ step: "sent", email });
    if (answer.error.code === "RESET_PASSWORD_DISABLED") return setState({ step: "off" });
    toast.error(answer.error.status === 429 ? m.verify_too_many() : m.auth_failed());
  }

  return (
    <AppShell>
      <ForgotPasswordPage state={state} onAsk={ask} />
    </AppShell>
  );
}
