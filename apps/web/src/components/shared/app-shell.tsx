import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { AuthPromptProvider } from "@/components/auth/auth-prompt";
import Header from "@/components/header";

export function AppShell({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  return (
    // What the account owns is loaded again once someone signs in.
    <AuthPromptProvider onSignedIn={() => void queryClient.invalidateQueries()}>
      <div className="grid h-svh grid-rows-[auto_1fr]">
        <Header />
        {children}
      </div>
    </AuthPromptProvider>
  );
}
