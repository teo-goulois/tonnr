import { isLocale, LOCALES } from "@repo/config/locales";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { useTell } from "@/components/ui/toast";
import { ENV } from "@/env";
import { useAccount } from "@/lib/account";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import { orpc } from "@/utils/orpc";

import { inviteAddress } from "./friend-words";

// The link of the signed-in account and the friends it made, as the web's `useFriends`
// (`apps/web/src/routes/app/-friends.ts`) answers them: decision 041. Each is kept under the id
// of the account that is signed in, and is no other account's.

/** The language the app is set to, as a link is written in it. */
const localeNow = () => {
  const locale = getLocale();
  return isLocale(locale) ? locale : LOCALES[0];
};

/** What a friendship changes is read again: the friends, their link and what they wrote. */
export function useFriendsChanged() {
  const queryClient = useQueryClient();
  return useCallback(
    () => queryClient.invalidateQueries({ queryKey: orpc.v1.friends.key() }),
    [queryClient],
  );
}

/**
 * The account's link, its friends and what ends a friendship. `username` is the account's: one
 * with none has no link to give, and it is not asked for.
 */
export function useFriends(username: string | null | undefined) {
  const { userId } = useAccount();
  const signedIn = userId !== undefined;
  const tell = useTell();
  const changed = useFriendsChanged();

  const link = useQuery(
    orpc.v1.friends.link.queryOptions({
      queryKey: [...orpc.v1.friends.link.queryKey(), userId],
      enabled: signedIn && typeof username === "string",
    }),
  );
  const friends = useQuery(
    orpc.v1.friends.list.queryOptions({
      queryKey: [...orpc.v1.friends.list.queryKey(), userId],
      enabled: signedIn,
      select: (answer) => answer.friends,
    }),
  );
  const renew = useMutation(
    orpc.v1.friends.renewLink.mutationOptions({
      onSuccess: () => {
        tell({ title: m.friends_link_renewed(), tone: "success" });
        return changed();
      },
      onError: () => tell({ title: m.invite_failed(), tone: "danger" }),
    }),
  );
  const remove = useMutation(
    orpc.v1.friends.remove.mutationOptions({
      onSuccess: () => {
        tell({ title: m.friends_removed(), tone: "success" });
        return changed();
      },
      onError: () => {
        tell({ title: m.invite_failed(), tone: "danger" });
        void changed();
      },
    }),
  );

  const token = link.data?.token;
  return {
    // The address the link is sent by, once the API gave it.
    address:
      token === undefined ? undefined : inviteAddress(token, ENV.EXPO_PUBLIC_SITE_URL, localeNow()),
    link,
    friends,
    renew: () => renew.mutate({}),
    isRenewing: renew.isPending,
    remove: (id: string, then?: () => void) => remove.mutate({ id }, { onSuccess: then }),
    isRemoving: remove.isPending,
    refresh: () =>
      Promise.all([friends.refetch(), typeof username === "string" ? link.refetch() : undefined]),
  };
}

/** What a friend wrote that was confirmed, asked for once their row unfolds. */
export function useFriendDetail(id: string | undefined) {
  const { userId } = useAccount();
  const input = { id: id ?? "" };
  return useQuery(
    orpc.v1.friends.get.queryOptions({
      input,
      queryKey: [...orpc.v1.friends.get.queryKey({ input }), userId],
      enabled: userId !== undefined && id !== undefined,
    }),
  );
}
