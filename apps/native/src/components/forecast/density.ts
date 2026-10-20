import {
  DEFAULT_DENSITY,
  DENSITY_KEY,
  type Density,
  densityName as nameOf,
  isDensity,
} from "@repo/client/density";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useSyncExternalStore } from "react";

import { useTell } from "@/components/ui/toast";
import { useAccount } from "@/lib/account";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

// How much of the forecast a panel shows, which the phone keeps so that a panel opens in it, and
// the account keeps so that it is the same on every device: the account's answer wins. The
// densities, their order and their names live in packages/client, which the web reads too, and
// this is the app's `apps/web/src/lib/density.ts` with its `density-account.tsx`. The line of the
// account's settings reads and writes it here. Decision 061.
export {
  DEFAULT_DENSITY,
  DENSITIES,
  type Density,
  lessDense,
  moreDense,
} from "@repo/client/density";

let density: Density | undefined;
const listeners = new Set<() => void>();

/** The density this phone kept from before. Undefined when it kept nothing it knows. */
export function storedDensity(): Density | undefined {
  try {
    const kept = localStorage.getItem(DENSITY_KEY);
    return isDensity(kept) ? kept : undefined;
  } catch {
    return undefined;
  }
}

/** The density in force. A panel reads it through `useDensity`. */
export function getDensity(): Density {
  density ??= storedDensity() ?? DEFAULT_DENSITY;
  return density;
}

/** Puts a density in force, for every panel, and keeps it on the phone. */
export function setDensity(next: Density) {
  if (next === getDensity()) return;
  density = next;
  try {
    localStorage.setItem(DENSITY_KEY, next);
  } catch {
    // A phone that keeps nothing still shows the density chosen, until the app is closed.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * The density in force, for a panel: it is drawn again when it changes. For an account, what
 * the account keeps is put in force once it answers.
 */
export function useDensity() {
  const { signedIn } = useAccount();
  const saved = useQuery(
    orpc.v1.preferences.getDisplay.queryOptions({
      enabled: signedIn,
      // An API from before the display answers with an error: the phone's own then stands.
      retry: false,
      staleTime: 5 * 60_000,
      meta: { quiet: true },
    }),
  );
  const kept = saved.data?.density;
  useEffect(() => {
    if (kept) setDensity(kept);
  }, [kept]);
  return useSyncExternalStore(subscribe, getDensity, getDensity);
}

/**
 * Changes how much of the forecast a panel shows, at once, and keeps it in the account. Without
 * an account the phone alone keeps it. When the account does not take it, the panels go back to
 * what it holds and say so, as the units do.
 */
export function useSaveDensity() {
  const { signedIn } = useAccount();
  const tell = useTell();
  const queryClient = useQueryClient();
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

/** The name of a density, as the account's settings write it. */
export function densityName(of: Density) {
  return nameOf(of, {
    density_essentials: m.density_essentials,
    density_details: m.density_details,
    density_everything: m.density_everything,
  });
}
