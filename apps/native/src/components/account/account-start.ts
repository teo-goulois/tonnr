import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { useOnboardingOnce } from "@/components/profile/use-profile";
import { useLiveSessionOffer } from "@/components/sessions/use-live-offer";
import { useAccount } from "@/lib/account";

import { useKeptSettings } from "./kept-settings";
import { forgetOnPhone } from "./leave";
import { useComeBackAfterRestart } from "./restart";

/**
 * Forgets what the phone kept for an account once it learns that the account is no longer the
 * one signed in here: signed out elsewhere, its session closed by an operator or by a new
 * password, or another account signed in. Decision 070.
 */
function useForgetWhenLeft() {
  const { userId, pending } = useAccount();
  const queryClient = useQueryClient();
  const last = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (pending) return;
    if (last.current !== undefined && last.current !== userId) forgetOnPhone(queryClient);
    last.current = userId;
  }, [userId, pending, queryClient]);
}

/**
 * What the app does with the account as it runs, whatever screen is open: the units and the
 * density in force, the phone's kept things forgotten when the account leaves, the questions
 * of decision 063 asked once, a session that was timed and not written offered once (decision
 * 074), and the account's tab opened again after a change of language started the app again.
 * The tabs mount it; it draws nothing.
 */
export function useAccountStart() {
  useKeptSettings();
  useForgetWhenLeft();
  useComeBackAfterRestart();
  useOnboardingOnce();
  useLiveSessionOffer();
}
