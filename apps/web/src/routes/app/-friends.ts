import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { useAuthPrompt } from "@/components/auth/auth-prompt";
import type { Friending, Invitation } from "@/components/friends/types";
import { m } from "@/paraglide/messages.js";
import { localizeHref } from "@/paraglide/runtime.js";
import { orpc } from "@/utils/orpc";

/** The address a link is sent by, in the language of whoever sends it. */
export function inviteAddress(token: string) {
  return new URL(localizeHref(`/i/${token}`), window.location.origin).href;
}

function loadable<Data>(query: { data: Data | undefined; isLoading: boolean; isError: boolean }) {
  return { data: query.data, isPending: query.isLoading, isError: query.isError };
}

/**
 * The link of the signed-in account and the friends it made, and the link the address names,
 * if it names one: decision 041. The account's link and its friends are asked for where they
 * show, in the account's panel. `account` is the id of the account that is signed in: its link
 * and its friends are kept under it, and are no other account's. `username` is the account's,
 * once the API has said.
 */
export function useFriends({
  account,
  username,
  isShown,
  invite,
  onInviteDone,
}: {
  account: string | undefined;
  username: string | null | undefined;
  isShown: boolean;
  // What the link the address names ends with.
  invite: string | undefined;
  // Takes the link out of the address, once it has done what it does or was left.
  onInviteDone: () => void;
}) {
  const queryClient = useQueryClient();
  const promptAuth = useAuthPrompt();
  const signedIn = account !== undefined;

  // An account with no username has no link to give: it is not asked for.
  const link = useQuery(
    orpc.v1.friends.link.queryOptions({
      queryKey: [...orpc.v1.friends.link.queryKey(), account],
      enabled: signedIn && isShown && typeof username === "string",
      meta: { quiet: true },
    }),
  );
  const friends = useQuery(
    orpc.v1.friends.list.queryOptions({
      queryKey: [...orpc.v1.friends.list.queryKey(), account],
      // Whoever opens a link is told at once when its owner is a friend already.
      enabled: signedIn && (isShown || invite !== undefined),
      select: (answer) => answer.friends,
      meta: { quiet: true },
    }),
  );
  // The friend whose contributions are open, for the account that opened them.
  const [opened, setOpened] = useState<{ account: string | undefined; id: string }>();
  const openedId = opened !== undefined && opened.account === account ? opened.id : undefined;
  const setOpenedId = (id: string | undefined) =>
    setOpened(id === undefined ? undefined : { account, id });
  const detailInput = { id: openedId ?? "" };
  const detail = useQuery(
    orpc.v1.friends.get.queryOptions({
      input: detailInput,
      queryKey: [...orpc.v1.friends.get.queryKey({ input: detailInput }), account],
      enabled: signedIn && isShown && openedId !== undefined,
      meta: { quiet: true },
    }),
  );

  const changed = useCallback(
    () => queryClient.invalidateQueries({ queryKey: orpc.v1.friends.key() }),
    [queryClient],
  );
  const renew = useMutation(
    orpc.v1.friends.renewLink.mutationOptions({
      onSuccess: () => {
        toast.success(m.friends_link_renewed());
        return changed();
      },
      onError: () => toast.error(m.invite_failed()),
    }),
  );
  const remove = useMutation(
    orpc.v1.friends.remove.mutationOptions({
      onSuccess: () => {
        toast.success(m.friends_removed());
        setOpenedId(undefined);
        return changed();
      },
      onError: () => {
        toast.error(m.invite_failed());
        void changed();
      },
    }),
  );

  // Whose link the address names, said to anyone: a visitor reads it before they sign up.
  const inviter = useQuery(
    orpc.v1.friends.open.queryOptions({
      input: { token: invite ?? "" },
      enabled: invite !== undefined,
      retry: false,
      staleTime: Number.POSITIVE_INFINITY,
      meta: { quiet: true },
    }),
  );
  const accept = useMutation(
    orpc.v1.friends.accept.mutationOptions({
      onSuccess: (friend) => {
        toast.success(m.invite_accepted({ username: friend.username ?? "" }));
        onInviteDone();
        return changed();
      },
      onError: (error) => {
        const code = (error as { code?: unknown }).code;
        toast.error(
          code === "CONFLICT"
            ? m.invite_own()
            : code === "FORBIDDEN"
              ? m.invite_ended()
              : code === "NOT_FOUND"
                ? m.invite_gone()
                : m.invite_failed(),
        );
        // A link that makes nothing is left: asking again would say the same.
        if (code !== undefined) onInviteDone();
      },
    }),
  );

  // An account that was just made through the link is its owner's friend already: it is told
  // so, and asked nothing more.
  const inviterName = inviter.data?.username;
  const isFriendAlready =
    signedIn && inviterName !== undefined
      ? (friends.data?.some((friend) => friend.username === inviterName) ?? false)
      : false;
  useEffect(() => {
    if (!isFriendAlready || inviterName === undefined) return;
    toast.success(m.invite_accepted({ username: inviterName }));
    onInviteDone();
  }, [isFriendAlready, inviterName, onInviteDone]);

  const token = link.data?.token;
  const { mutate: sendRenewal } = renew;
  const { mutate: sendRemoval } = remove;
  const friending: Friending = {
    link: token === undefined ? undefined : inviteAddress(token),
    friends: loadable(friends),
    opened: openedId === undefined ? undefined : { id: openedId, detail: loadable(detail) },
    onOpen: setOpenedId,
    isRenewing: renew.isPending,
    onRenew: () => sendRenewal({}),
    isRemoving: remove.isPending,
    onRemove: (id) => sendRemoval({ id }),
  };

  const { mutate: sendAcceptance } = accept;
  const invitation: Invitation | undefined =
    invite === undefined || isFriendAlready
      ? undefined
      : {
          inviter: loadable(inviter),
          isGone: inviter.isError,
          isAccepting: accept.isPending,
          onAccept: () => sendAcceptance({ token: invite }),
          onCreateAccount: () =>
            promptAuth({
              mode: "sign-up",
              invitation: invite,
              ...(inviterName !== undefined && {
                reason: m.invite_reason({ username: inviterName }),
              }),
            }),
          // An account that signs in is asked again, by this dialog, whether it becomes a
          // friend: it had no part in the link until then.
          onSignIn: () => promptAuth({ mode: "sign-in" }),
          onClose: onInviteDone,
        };

  return { friending, invitation, friendCount: friends.data?.length };
}
