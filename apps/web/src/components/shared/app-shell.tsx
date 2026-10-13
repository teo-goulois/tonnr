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
 * What stands around every screen of the product: the header that floats over its top on a wide
 * screen, and the bar of tabs that floats over its bottom on a phone. CSS tells the two apart, since the server
 * draws this before it knows the screen, and says by `data-bottom-nav` that there is a bar to keep
 * clear of: `index.css` gives its height. Wide is `lg`, as in the viewer. Decision 040.
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
      <div
        data-bottom-nav={nav ? "" : undefined}
        // What the browser shows of the page, and no more: a browser that draws its own bar over
        // the page keeps what is fixed above it.
        className="fixed inset-0 grid grid-rows-[auto_minmax(0,1fr)]"
      >
        <Header nav={nav} className="max-lg:hidden" />
        <div className="row-start-2 grid min-h-0 grid-rows-[minmax(0,1fr)]">{children}</div>
        {nav && <BottomNav className="absolute inset-x-0 bottom-0 z-30 lg:hidden" />}
      </div>
    </AuthPromptProvider>
  );
}
