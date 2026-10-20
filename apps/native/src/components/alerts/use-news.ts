import type { AlertNotification, ReportNotice } from "@repo/client/viewer/types";
import { UNREAD_NOTIFICATIONS_COUNTED } from "@repo/config/unread";
import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";

import { useTell } from "@/components/ui/toast";
import { useAccount } from "@/lib/account";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

// What the alerts told and the notices of reports, as the web's route reads them for the alerts
// panel, and how many of them are not read, which the tab counts as the web's bar does.
// Decisions 031, 068 and 072. Each is kept under the account it was asked for, so that an account
// that signs in after another never reads the first one's.

const MINUTE_MS = 60 * 1000;
// What the list of notifications grows by as it is scrolled to its end, up to what the API gives.
const PAGE = 50;
const MOST = 200;
const NOTICES_PAGE = 30;

type NoticePage = {
  notices: ReportNotice[];
  unread: number;
  next: { at: Date; id: string } | null;
};

/** What was told, read where it shows. */
export function useNews(isShown: boolean) {
  const { signedIn, userId } = useAccount();
  const queryClient = useQueryClient();
  const tell = useTell();
  const [limit, setLimit] = useState(PAGE);
  const [isPulled, setPulled] = useState(false);

  const notificationsKey = [
    ...orpc.v1.notifications.list.queryKey({ input: { limit } }),
    userId,
  ] as const;
  const notifications = useQuery(
    orpc.v1.notifications.list.queryOptions({
      input: { limit },
      queryKey: notificationsKey,
      enabled: signedIn && isShown,
      // A longer page keeps the shorter one in view while it comes.
      placeholderData: (previous) => previous,
      meta: { quiet: true },
    }),
  );
  const noticesKey = [...orpc.v1.reportNotices.list.key(), "feed", userId] as const;
  const notices = useInfiniteQuery(
    orpc.v1.reportNotices.list.infiniteOptions({
      input: (cursor: { at: Date; id: string } | undefined) =>
        cursor
          ? { limit: NOTICES_PAGE, before: cursor.at, beforeId: cursor.id }
          : { limit: NOTICES_PAGE },
      initialPageParam: undefined as { at: Date; id: string } | undefined,
      getNextPageParam: (page) => page.next ?? undefined,
      queryKey: noticesKey,
      enabled: signedIn && isShown,
      meta: { quiet: true },
    }),
  );

  // What is read is read at once on the screen, and the API is told after: the tab's count and
  // the lists are asked for again once it has answered.
  const settle = () => {
    void queryClient.invalidateQueries({ queryKey: orpc.v1.notifications.key() });
    void queryClient.invalidateQueries({ queryKey: orpc.v1.reportNotices.key() });
  };
  const markNotification = useMutation(orpc.v1.notifications.markRead.mutationOptions());
  const markNotice = useMutation(orpc.v1.reportNotices.markRead.mutationOptions());
  const readNotifications = (ids: Set<string>) =>
    queryClient.setQueryData<{ notifications: AlertNotification[] }>(notificationsKey, (answer) =>
      answer
        ? {
            notifications: answer.notifications.map((one) =>
              ids.has(one.id) && one.readAt === null ? { ...one, readAt: new Date() } : one,
            ),
          }
        : answer,
    );
  const readNotices = (ids: Set<string>) =>
    queryClient.setQueryData<InfiniteData<NoticePage>>(noticesKey, (data) =>
      data
        ? {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              notices: page.notices.map((one) =>
                ids.has(one.id) && one.readAt === null ? { ...one, readAt: new Date() } : one,
              ),
            })),
          }
        : data,
    );
  const failed = () => tell({ title: m.native_mark_read_failed(), tone: "danger" });

  const readNotification = (notification: AlertNotification) => {
    if (notification.readAt !== null) return;
    readNotifications(new Set([notification.id]));
    markNotification.mutateAsync({ id: notification.id }).catch(failed).finally(settle);
  };
  const readNotice = (notice: ReportNotice) => {
    // Read whatever the list shows of it, read or not: a report may have joined it since.
    readNotices(new Set([notice.id]));
    markNotice.mutateAsync({ id: notice.id }).catch(failed).finally(settle);
  };

  const notificationList = notifications.data?.notifications;
  const noticeList = useMemo(
    () => notices.data?.pages.flatMap((page) => page.notices),
    [notices.data],
  );
  const unreadHere =
    (notificationList ?? []).filter((one) => one.readAt === null).length +
    (noticeList ?? []).filter((one) => one.readAt === null).length;

  // The API reads one at a time: every one the list shows unread is told, together.
  const readAll = () => {
    const unreadNotifications = (notificationList ?? []).filter((one) => one.readAt === null);
    const unreadNotices = (noticeList ?? []).filter((one) => one.readAt === null);
    readNotifications(new Set(unreadNotifications.map((one) => one.id)));
    readNotices(new Set(unreadNotices.map((one) => one.id)));
    void Promise.all([
      ...unreadNotifications.map((one) => markNotification.mutateAsync({ id: one.id })),
      ...unreadNotices.map((one) => markNotice.mutateAsync({ id: one.id })),
    ])
      .catch(failed)
      .finally(settle);
  };

  const canGrow =
    notificationList !== undefined && notificationList.length >= limit && limit < MOST;
  return {
    notifications: notificationList,
    notices: noticeList,
    isPending: notifications.isLoading || notices.isLoading,
    // The notices are said when they come: what cannot be loaded of them leaves the alerts.
    isError: notifications.isError,
    // The list pulled down turns while it is read again, and only then: what is marked read asks
    // for it again too, under a list that stays still.
    isRefreshing: isPulled,
    refresh: () => {
      setPulled(true);
      void Promise.all([notifications.refetch(), notices.refetch()]).finally(() =>
        setPulled(false),
      );
    },
    unreadHere,
    readNotification,
    readNotice,
    readAll,
    // Older things told, as the list is scrolled to its end.
    hasMore: canGrow || notices.hasNextPage,
    isLoadingMore: notices.isFetchingNextPage || (notifications.isFetching && canGrow),
    loadMore: () => {
      if (notices.hasNextPage && !notices.isFetchingNextPage) void notices.fetchNextPage();
      if (canGrow) setLimit((now) => Math.min(MOST, now + PAGE));
    },
  };
}

/**
 * How many of what its alerts told and of its notices of reports the account has not read, as
 * the web's bar counts them (`useUnreadAlerts`): asked again every five minutes, and when the app
 * comes back to the screen. None for a visitor.
 */
export function useUnreadCount() {
  const { userId } = useAccount();
  const asked = {
    enabled: userId !== undefined,
    refetchInterval: 5 * MINUTE_MS,
    meta: { quiet: true },
  };
  const alerts = { unreadOnly: true, limit: UNREAD_NOTIFICATIONS_COUNTED };
  const unread = useQuery(
    orpc.v1.notifications.list.queryOptions({
      input: alerts,
      queryKey: [...orpc.v1.notifications.list.queryKey({ input: alerts }), userId],
      ...asked,
    }),
  );
  const reports = { unreadOnly: true, limit: 1 };
  const notices = useQuery(
    orpc.v1.reportNotices.list.queryOptions({
      input: reports,
      queryKey: [...orpc.v1.reportNotices.list.queryKey({ input: reports }), userId],
      ...asked,
    }),
  );
  const { refetch: refetchUnread } = unread;
  const { refetch: refetchNotices } = notices;
  useEffect(() => {
    if (userId === undefined) return;
    const listening = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      void refetchUnread();
      void refetchNotices();
    });
    return () => listening.remove();
  }, [userId, refetchUnread, refetchNotices]);
  if (userId === undefined) return 0;
  return (unread.data?.notifications.length ?? 0) + (notices.data?.unread ?? 0);
}
