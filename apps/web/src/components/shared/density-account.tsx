import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";
import { type Density, getDensity, setDensity, storedDensity } from "@/lib/density";
import { m } from "@/paraglide/messages.js";
import { orpc } from "@/utils/orpc";

/**
 * Puts in force how much of the forecast a panel shows: first what this browser kept, so that a
 * page opens in it, then what the account chose, which is the same on every device. It draws
 * nothing. Decision 061.
 */
export function DisplayFromAccount() {
  const { data: session } = authClient.useSession();
  const saved = useQuery(
    orpc.preferences.getDisplay.queryOptions({
      enabled: Boolean(session),
      // An API from before the display answers with an error: the browser's own then stands.
      retry: false,
      meta: { quiet: true },
    }),
  );

  useEffect(() => {
    const kept = storedDensity();
    if (kept) setDensity(kept);
  }, []);
  useEffect(() => {
    if (saved.data) setDensity(saved.data.density);
  }, [saved.data]);

  return null;
}

/**
 * Changes how much of the forecast a panel shows, at once, and keeps it in the account. Without
 * an account the browser alone keeps it.
 */
export function useSaveDensity() {
  const { data: session } = authClient.useSession();
  const queryClient = useQueryClient();
  const save = useMutation(
    orpc.preferences.saveDisplay.mutationOptions({
      onSuccess: (data) => queryClient.setQueryData(orpc.preferences.getDisplay.queryKey(), data),
    }),
  );

  return (next: Density) => {
    const before = getDensity();
    setDensity(next);
    if (!session) return;
    save.mutate(
      { density: next },
      {
        // The account did not take it: the panels go back to what it holds.
        onError: () => {
          setDensity(before);
          toast.error(m.density_error());
        },
      },
    );
  };
}
