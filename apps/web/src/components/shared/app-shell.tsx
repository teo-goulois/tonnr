import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { AuthPromptProvider } from "@/components/auth/auth-prompt";
import Header from "@/components/header";

import { UnitsFromAccount } from "./units-account";

export function AppShell({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const router = useRouter();

  return (
    // What the account owns is loaded again once someone signs in, and the route asks again
    // who it takes: a visitor it asked for an account is let in.
    <AuthPromptProvider
      onSignedIn={() => {
        void queryClient.invalidateQueries();
        void router.invalidate();
      }}
    >
      <UnitsFromAccount />
      <div className="grid h-svh grid-rows-[auto_1fr]">
        <Header />
        {children}
      </div>
    </AuthPromptProvider>
  );
}
