import type { BlockedAccount } from "@repo/client/viewer/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useIsFocused } from "expo-router";
import { useCallback, useEffect, useState } from "react";

import { confirmDestructive } from "@/components/saved/confirm";
import { useTell } from "@/components/ui/toast";
import { useAccount } from "@/lib/account";
import { useRequireAccount } from "@/lib/require-account";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

// Blocking an account, and lifting a block, as the web's `useBlocks` does (decision 071): a
// block hides the other's reports, what it has waiting in a guide and its username, and ends a
// friendship. The blocked account is not told. Whatever shows another account in the app blocks
// it through `useBlock`: the author of a line of a guide, a friend, a report.

/**
 * Asks whether to block an account, in the platform's own words: what the block hides and that
 * the other is not told, with the one button that blocks, as the web's `BlockDialog` asks. True
 * when the person said to.
 */
export function confirmBlock(username: string) {
  return confirmDestructive({
    title: m.block_confirm_title({ username }),
    message: m.block_confirm_text(),
    confirm: m.block_confirm(),
  });
}

/** What a block changes is read again: the reports, the guides, the friends, the notices, a list. */
function useBlockChanged() {
  const queryClient = useQueryClient();
  return useCallback(
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
}

/**
 * What blocks an account by its username, once the reader said so. A visitor is asked for an
 * account first, and then asked this, whichever account it signed in with, as the web's
 * `useBlocks` asks it. `onBlocked` follows a block that was made.
 */
export function useBlock({ onBlocked }: { onBlocked?: () => void } = {}) {
  const { signedIn } = useAccount();
  const requireAccount = useRequireAccount();
  const tell = useTell();
  const changed = useBlockChanged();
  const focused = useIsFocused();
  // The username a visitor asked to block, until it is asked again once signed in.
  const [asked, setAsked] = useState<string>();
  const add = useMutation(
    orpc.v1.blocks.add.mutationOptions({
      onSuccess: (blocked) => {
        tell({ title: m.block_done({ username: blocked.username }), tone: "success" });
        onBlocked?.();
        return changed();
      },
      onError: (error) => {
        const code = (error as { code?: unknown }).code;
        tell({
          title: code === "FORBIDDEN" ? m.block_too_many() : m.block_failed(),
          tone: "danger",
        });
      },
    }),
  );
  const { mutate } = add;

  // Asked once the sign-in has left and the screen is in view again, so that the question is
  // not shown over a sheet that goes.
  useEffect(() => {
    if (asked === undefined || !signedIn || !focused) return;
    setAsked(undefined);
    void confirmBlock(asked).then((yes) => {
      if (yes) mutate({ username: asked });
    });
  }, [asked, signedIn, focused, mutate]);

  const block = useCallback(
    (username: string) => {
      if (!signedIn) {
        setAsked(username);
        requireAccount(m.block_sign_in(), () => {});
        return;
      }
      void confirmBlock(username).then((yes) => {
        if (yes) mutate({ username });
      });
    },
    [signedIn, requireAccount, mutate],
  );
  return { block, isBlocking: add.isPending };
}

/**
 * The accounts the signed-in account blocked, read where they show, and what lifts a block. The
 * list is kept under the account that is signed in, and is no other's.
 */
export function useBlockedAccounts() {
  const { userId } = useAccount();
  const tell = useTell();
  const changed = useBlockChanged();
  const list = useQuery(
    orpc.v1.blocks.list.queryOptions({
      queryKey: [...orpc.v1.blocks.list.queryKey(), userId],
      enabled: userId !== undefined,
      select: (answer) => answer.blocks,
    }),
  );
  const [lifting, setLifting] = useState<string>();
  const remove = useMutation(
    orpc.v1.blocks.remove.mutationOptions({
      onSuccess: () => {
        tell({ title: m.block_lifted(), tone: "success" });
        return changed();
      },
      onError: () => {
        tell({ title: m.block_unblock_failed(), tone: "danger" });
        void changed();
      },
      onSettled: () => setLifting(undefined),
    }),
  );
  const { mutate } = remove;
  return {
    list,
    lifting,
    unblock: (one: BlockedAccount) => {
      setLifting(one.id);
      mutate({ id: one.id });
    },
  };
}
