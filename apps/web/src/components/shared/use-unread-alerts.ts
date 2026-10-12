import { useQuery } from "@tanstack/react-query";

import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";

const MINUTE_MS = 60 * 1000;

/** How many of its alerts' notifications the account has not read. None for a visitor. */
export function useUnreadAlerts() {
  const { data: session } = authClient.useSession();
  const unread = useQuery(
    orpc.v1.notifications.list.queryOptions({
      input: { unreadOnly: true, limit: 50 },
      enabled: Boolean(session),
      refetchInterval: 5 * MINUTE_MS,
      // The alerts panel says when they cannot be loaded. The bell just shows no count.
      meta: { quiet: true },
    }),
  );
  return session ? (unread.data?.notifications.length ?? 0) : 0;
}
