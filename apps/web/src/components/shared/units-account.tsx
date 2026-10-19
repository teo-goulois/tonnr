import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";
import { type Units, getUnits, setUnits, storedUnits } from "@/lib/units";
import { m } from "@/paraglide/messages.js";
import { orpc } from "@/utils/orpc";

/**
 * Puts the reader's units in force: first those this browser kept, so that a page opens in
 * them, then those of the account, which are the same on every device. It draws nothing.
 */
export function UnitsFromAccount() {
  const { data: session } = authClient.useSession();
  const saved = useQuery(
    orpc.v1.preferences.getUnits.queryOptions({
      enabled: Boolean(session),
      // An API from before the units answers with an error: the browser's own then stand.
      retry: false,
      meta: { quiet: true },
    }),
  );

  useEffect(() => {
    const kept = storedUnits();
    if (kept) setUnits(kept);
  }, []);
  useEffect(() => {
    if (saved.data) setUnits(saved.data);
  }, [saved.data]);

  return null;
}

/**
 * Changes some of the reader's units at once, and keeps them in the account. Without an account
 * the browser alone keeps them.
 */
export function useSaveUnits() {
  const { data: session } = authClient.useSession();
  const queryClient = useQueryClient();
  const save = useMutation(
    orpc.v1.preferences.saveUnits.mutationOptions({
      onSuccess: (data) => queryClient.setQueryData(orpc.v1.preferences.getUnits.queryKey(), data),
    }),
  );

  return (change: Partial<Units>) => {
    const before = getUnits();
    setUnits({ ...before, ...change });
    if (!session) return;
    save.mutate(change, {
      // The account did not take them: the screens go back to what it holds.
      onError: () => {
        setUnits(before);
        toast.error(m.units_error());
      },
    });
  };
}
