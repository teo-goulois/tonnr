import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { useTell } from "@/components/ui/toast";
import { useAccount } from "@/lib/account";
import { getUnits, setUnits, storedUnits, type Units } from "@/lib/units";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

import { type Density, getDensity, setDensity } from "./display";

// The units and the density are the account's, so that they are the same on every device, and
// the phone's, so that a screen opens in them before the account has answered, and for a
// visitor: decisions 033, 061 and 069, which moved them into `v1.preferences`.

/**
 * Puts the reader's units and density in force: first those the phone kept, then those of the
 * account once it has answered. It draws nothing.
 */
export function useKeptSettings() {
  const { signedIn } = useAccount();
  const units = useQuery(
    orpc.v1.preferences.getUnits.queryOptions({ enabled: signedIn, retry: false }),
  );
  const display = useQuery(
    orpc.v1.preferences.getDisplay.queryOptions({ enabled: signedIn, retry: false }),
  );

  useEffect(() => {
    const kept = storedUnits();
    if (kept) setUnits(kept);
  }, []);
  useEffect(() => {
    if (units.data) setUnits(units.data);
  }, [units.data]);
  useEffect(() => {
    if (display.data) setDensity(display.data.density);
  }, [display.data]);
}

/**
 * Changes some of the reader's units at once, and keeps them in the account. Without an account
 * the phone alone keeps them. When the account refuses them, the screens go back to what it
 * holds and say so.
 */
export function useSaveUnits() {
  const { signedIn } = useAccount();
  const queryClient = useQueryClient();
  const tell = useTell();
  const save = useMutation(
    orpc.v1.preferences.saveUnits.mutationOptions({
      onSuccess: (data) => queryClient.setQueryData(orpc.v1.preferences.getUnits.queryKey(), data),
    }),
  );

  return (change: Partial<Units>) => {
    const before = getUnits();
    setUnits({ ...before, ...change });
    if (!signedIn) return;
    save.mutate(change, {
      onError: () => {
        setUnits(before);
        tell({ title: m.units_error(), tone: "danger" });
      },
    });
  };
}

/**
 * Changes how much of the forecast a panel shows, at once, and keeps it in the account. Without
 * an account the phone alone keeps it.
 */
export function useSaveDensity() {
  const { signedIn } = useAccount();
  const queryClient = useQueryClient();
  const tell = useTell();
  const save = useMutation(
    orpc.v1.preferences.saveDisplay.mutationOptions({
      onSuccess: (data) =>
        queryClient.setQueryData(orpc.v1.preferences.getDisplay.queryKey(), data),
    }),
  );

  return (next: Density) => {
    const before = getDensity();
    setDensity(next);
    if (!signedIn) return;
    save.mutate(
      { density: next },
      {
        onError: () => {
          setDensity(before);
          tell({ title: m.density_error(), tone: "danger" });
        },
      },
    );
  };
}
