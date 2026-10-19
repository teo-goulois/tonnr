import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import type { Blocking } from "@/components/account/blocked-accounts";
import { useAuthPrompt } from "@/components/auth/auth-prompt";
import { m } from "@/paraglide/messages.js";
import { orpc } from "@/utils/orpc";

// The accounts an account blocked, and what blocks and unblocks one: decision 071.

/**
 * What blocks an account, asked first, and the accounts the signed-in account blocked, read
 * where they show: in the account's panel. `account` is the id of the account that is signed in:
 * the list is kept under it, and a question asked for one account is not answered for another.
 */
export function useBlocks({
  account,
  isShown,
}: {
  account: string | undefined;
  isShown: boolean;
}): Blocking {
  const queryClient = useQueryClient();
  const promptAuth = useAuthPrompt();
  const signedIn = account !== undefined;

  const list = useQuery(
    orpc.v1.blocks.list.queryOptions({
      queryKey: [...orpc.v1.blocks.list.queryKey(), account],
      enabled: signedIn && isShown,
      select: (answer) => answer.blocks,
      meta: { quiet: true },
    }),
  );

  // What a block hides is read again: the reports of a break, its guide, the friends, the
  // notices of reports and the owner of a shared list.
  const changed = useCallback(
    () =>
      Promise.all(
        [
          orpc.v1.blocks.key(),
          orpc.v1.reports.key(),
          orpc.v1.guides.key(),
          orpc.v1.friends.key(),
          orpc.v1.reportNotices.key(),
          orpc.v1.shared.key(),
        ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      ),
    [queryClient],
  );

  // The account the reader is asked about, with who asked: an account, or null for a visitor
  // who signed in to block it, whichever account that is.
  const [asked, setAsked] = useState<{ by: string | null; username: string }>();
  const askedName =
    asked !== undefined && signedIn && (asked.by === null || asked.by === account)
      ? asked.username
      : undefined;

  const add = useMutation(
    orpc.v1.blocks.add.mutationOptions({
      onSuccess: (blocked) => {
        toast.success(m.block_done({ username: blocked.username ?? askedName ?? "" }));
        setAsked(undefined);
        return changed();
      },
      onError: (error) => {
        const code = (error as { code?: unknown }).code;
        toast.error(code === "FORBIDDEN" ? m.block_too_many() : m.block_failed());
        setAsked(undefined);
      },
    }),
  );
  const [unblocking, setUnblocking] = useState<string>();
  const remove = useMutation(
    orpc.v1.blocks.remove.mutationOptions({
      onSuccess: () => {
        toast.success(m.block_lifted());
        return changed();
      },
      onError: () => {
        toast.error(m.block_unblock_failed());
        void changed();
      },
      onSettled: () => setUnblocking(undefined),
    }),
  );

  const onBlock = useCallback(
    (username: string) => {
      if (account !== undefined) {
        setAsked({ by: account, username });
        return;
      }
      // A visitor has nothing to block yet: once signed in, it is asked as an account is.
      promptAuth({
        mode: "sign-in",
        reason: m.block_sign_in(),
        onSignedIn: () => setAsked({ by: null, username }),
      });
    },
    [account, promptAuth],
  );

  const { mutate: sendBlock } = add;
  const { mutate: sendUnblock } = remove;
  return {
    blocks: { data: list.data, isPending: list.isLoading, isError: list.isError },
    onBlock,
    unblocking,
    onUnblock: (one) => {
      setUnblocking(one.id);
      sendUnblock({ id: one.id });
    },
    asked: askedName,
    isBlocking: add.isPending,
    onConfirm: () => {
      if (askedName !== undefined) sendBlock({ username: askedName });
    },
    onCancel: () => setAsked(undefined),
  };
}
