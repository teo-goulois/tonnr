import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { AppState } from "react-native";

import { useTell } from "@/components/ui/toast";
import { useAccount } from "@/lib/account";
import { authClient } from "@/lib/auth-client";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import { orpc } from "@/utils/orpc";

const MINUTE_MS = 60 * 1000;

/**
 * What the API says of the account that is signed in: its username, whether its address is
 * checked and whether this instance checks addresses, whether it has a password and what else it
 * signs in with. An answer is kept under the account it was asked for, and given for that one
 * alone. While the address is not checked, it is asked again each time the app comes back, as
 * the link of the mail opens in a browser: decision 070. `session` is what the phone's session
 * says of the account, its name, its address and the username it had as it signed in, which a
 * screen shows while the API has not answered, or when it cannot, as the web's panel does.
 */
export function useOwnAccount() {
  const { signedIn, userId, pending } = useAccount();
  const user = authClient.useSession().data?.user;
  const asked = useQuery(
    orpc.v1.account.get.queryOptions({
      queryKey: [...orpc.v1.account.get.queryKey(), userId],
      enabled: userId !== undefined,
      staleTime: 5 * MINUTE_MS,
    }),
  );
  const account = asked.data?.id === userId ? asked.data : undefined;
  const unchecked = account?.checksAddresses === true && !account.emailVerified;
  const { refetch } = asked;

  useEffect(() => {
    if (!unchecked) return;
    const listening = AppState.addEventListener("change", (state) => {
      if (state === "active") void refetch();
    });
    return () => listening.remove();
  }, [unchecked, refetch]);

  return {
    // Undefined while the phone's session is not known.
    signedIn: pending ? undefined : signedIn,
    account,
    session: user && { name: user.name, email: user.email, username: user.username ?? null },
    isPending: pending || (userId !== undefined && asked.isPending),
    isError: asked.isError,
    refetch,
    isRefetching: asked.isRefetching,
  };
}

/**
 * Sends the signed-in account the mail that checks its address, once more, in the app's
 * language. It says what became of the request: the API refuses an address that is already
 * checked, and an account that was sent its mails for now.
 */
export function useSendVerification() {
  const queryClient = useQueryClient();
  const tell = useTell();
  const sending = useMutation(
    orpc.v1.account.sendVerification.mutationOptions({
      onSuccess: () => tell({ title: m.verify_sent(), tone: "success" }),
      onError: (error) => {
        const code = (error as { code?: unknown }).code;
        if (code === "CONFLICT") {
          // The screen held an older answer: the account is asked again.
          tell({ title: m.verify_already(), tone: "success" });
          void queryClient.invalidateQueries({ queryKey: orpc.v1.account.get.key() });
          return;
        }
        tell({
          title: code === "TOO_MANY_REQUESTS" ? m.verify_too_many() : m.verify_failed(),
          tone: "danger",
        });
      },
    }),
  );
  return { send: () => sending.mutate({ locale: getLocale() }), isSending: sending.isPending };
}
