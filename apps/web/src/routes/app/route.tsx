import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { AppShell } from "@/components/shared/app-shell";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/app")({
  // The session's cookie belongs to the browser: the server that renders has none to send.
  ssr: false,
  component: AppLayout,
  // The API answers no one it does not know, so the product takes a signed-in account.
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session.data) {
      throw redirect({
        to: "/login",
      });
    }
    return { session };
  },
});

function AppLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
