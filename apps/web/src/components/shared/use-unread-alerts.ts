import { useQuery } from "@tanstack/react-query";

import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";

const MINUTE_MS = 60 * 1000;

/**
 * How many of what its alerts told and of its notices of reports the account has not read:
 * decisions 031 and 068. None for a visitor. Each count is kept under the account it was asked
 * for: a session can become another account's in another tab.
 */
export function useUnreadAlerts() {
  const { data: session } = authClient.useSession();
  const accountId = session?.user.id;
  const asked = {
    enabled: accountId !== undefined,
    refetchInterval: 5 * MINUTE_MS,
    // The alerts panel says when they cannot be loaded. The bell just shows no count.
    meta: { quiet: true },
  };
  const alerts = { unreadOnly: true, limit: 50 };
  const unread = useQuery(
    orpc.v1.notifications.list.queryOptions({
      input: alerts,
      queryKey: [...orpc.v1.notifications.list.queryKey({ input: alerts }), accountId],
      ...asked,
    }),
  );
  const reports = { unreadOnly: true, limit: 1 };
  const notices = useQuery(
    orpc.v1.reportNotices.list.queryOptions({
      input: reports,
      queryKey: [...orpc.v1.reportNotices.list.queryKey({ input: reports }), accountId],
      ...asked,
    }),
  );
  if (!accountId) return 0;
  return (unread.data?.notifications.length ?? 0) + (notices.data?.unread ?? 0);
}
