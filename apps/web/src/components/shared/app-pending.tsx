import { ViewerSkeleton } from "@/components/viewer/viewer-skeleton";

import { AppShell } from "./app-shell";

/**
 * The product before it knows who opens it: its bar, which is the real one, and the map's place.
 * The server sends it for `/app`, which it does not render, and the browser shows it until the
 * API has said whether there is a session.
 */
export function AppPending() {
  return (
    <AppShell>
      <ViewerSkeleton />
    </AppShell>
  );
}
