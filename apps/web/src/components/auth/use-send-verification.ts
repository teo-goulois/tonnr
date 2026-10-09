import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";
import { orpc } from "@/utils/orpc";

/**
 * Sends the signed-in account the mail that checks its address, once more, in the language the
 * page is read in. It says what became of the request: the API refuses an address that is
 * already checked, and an account that was sent its mails for now.
 */
export function useSendVerification() {
  const queryClient = useQueryClient();
  const sending = useMutation(
    orpc.v1.account.sendVerification.mutationOptions({
      onSuccess: () => {
        toast.success(m.verify_sent());
      },
      onError: (error) => {
        const code = (error as { code?: unknown }).code;
        if (code === "CONFLICT") {
          // The page held an older answer: the account is asked again.
          toast.success(m.verify_already());
          void queryClient.invalidateQueries({ queryKey: orpc.v1.account.get.key() });
          return;
        }
        toast.error(code === "TOO_MANY_REQUESTS" ? m.verify_too_many() : m.verify_failed());
      },
    }),
  );

  return { send: () => sending.mutate({ locale: getLocale() }), isSending: sending.isPending };
}
