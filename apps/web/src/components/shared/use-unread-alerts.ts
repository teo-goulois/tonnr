import { useQuery } from "@tanstack/react-query";

import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";

const MINUTE_MS = 60 * 1000;

/**
 * How many of what its alerts told and of its notices of reports the account has not read:
 * decisions 031 and 068. None for a visitor.
 */
export function useUnreadAlerts() {
  const { data: session } = authClient.useSession();
  const asked = {
    enabled: Boolean(session),
    refetchInterval: 5 * MINUTE_MS,
    // The alerts panel says when they cannot be loaded. The bell just shows no count.
    meta: { quiet: true },
  };
  const unread = useQuery(
    orpc.v1.notifications.list.queryOptions({ input: { unreadOnly: true, limit: 50 }, ...asked }),
  );
  const notices = useQuery(
    orpc.v1.reportNotices.list.queryOptions({ input: { unreadOnly: true, limit: 1 }, ...asked }),
  );
  if (!session) return 0;
  return (unread.data?.notifications.length ?? 0) + (notices.data?.unread ?? 0);
}
