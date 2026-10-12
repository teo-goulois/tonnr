import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { AuthPromptProvider } from "@/components/auth/auth-prompt";
import Header from "@/components/header";

import { BottomNav } from "./bottom-nav";
import { UnitsFromAccount } from "./units-account";

type AppShellProps = {
  // False where there is nowhere to go: the wall of an instance that is closed to visitors.
  nav?: boolean;
  children: ReactNode;
};

/**
 * What stands around every screen of the product: the header above it on a wide screen, and the
 * bar of tabs under it on a phone. CSS tells the two apart, since the server draws this before
 * it knows the screen. Wide is `lg`, as in the viewer. Decision 040.
 */
export function AppShell({ nav = true, children }: AppShellProps) {
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
      <div className="grid h-svh grid-rows-[auto_minmax(0,1fr)_auto]">
        <Header className="row-start-1 max-lg:hidden" />
        <div className="row-start-2 grid min-h-0 grid-rows-[minmax(0,1fr)]">{children}</div>
        {nav && <BottomNav className="row-start-3 lg:hidden" />}
      </div>
    </AuthPromptProvider>
  );
}
