import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { useAccount } from "@/lib/account";
import { appHeader } from "@/lib/app-client";
import { authClient } from "@/lib/auth-client";
import { forgetLiveSession } from "@/lib/live-session";
import { pushIsOn, switchPushOff } from "@/lib/push";
import { clearRecents } from "@/lib/recents";
import { clearWidgets } from "@/widgets/write";

import { forgetPushKeys } from "../../../modules/push-keys";

/**
 * Forgets on the phone what was kept for an account that is no longer signed in here: what was
 * loaded for it, what it looked at last, its session in progress, and what its widgets show,
 * which the space the app shares with its extensions kept (decision 074). The units, the theme
 * and the language stay: they are the phone's, as a browser keeps them. Decision 070.
 */
export function forgetOnPhone(queryClient: QueryClient) {
  queryClient.clear();
  clearRecents();
  clearWidgets();
  void forgetLiveSession().catch(() => {});
}

/**
 * Lets go of the phone's push device and of its keys in the keychain, as signing out does
 * (decisions 070 and 072): the API forgets the device while the session still names it, and
 * would forget it with the session anyway.
 */
async function forgetPush(account: string | undefined) {
  try {
    if (pushIsOn()) await switchPushOff(account);
    else await forgetPushKeys();
  } catch {
    // Keys that were never made, or a keychain that cannot be read: there is nothing to forget.
  }
}

/**
 * Signs the account out on this phone, or lets go of an account that was just deleted: the push
 * device and its keys go, the session ends at the API, its cookie leaves the keychain, and the
 * phone forgets what it kept for the account. The library's client lets go of the cookie before
 * it asks the API, so the phone is signed out whatever the API answers: a session the API could
 * not end then ends at its time, with no cookie left here to use it.
 */
export async function leaveOnPhone(queryClient: QueryClient, account: string | undefined) {
  await forgetPush(account);
  await authClient
    .signOut({ fetchOptions: { headers: { "X-App": appHeader() } } })
    .catch(() => null);
  forgetOnPhone(queryClient);
}

/** Signs the account out on this phone: `leaveOnPhone` for the account signed in. */
export function useSignOut() {
  const queryClient = useQueryClient();
  const { userId } = useAccount();
  return useCallback(() => leaveOnPhone(queryClient, userId), [queryClient, userId]);
}
