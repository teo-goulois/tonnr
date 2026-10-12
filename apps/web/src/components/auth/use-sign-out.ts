import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { authClient } from "@/lib/auth-client";
import { leftPushHere } from "@/lib/push-here";
import { clearRecents } from "@/lib/recents";
import { leaveWith } from "@/lib/unsaved";

/**
 * Signs the account out, from the menu of a wide screen as from the account's screen of a phone.
 * Something written and not saved is asked about before the session ends: once it has, there
 * is no staying.
 */
export function useSignOut() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const signOut = async () => {
    const answer = await authClient.signOut().catch(() => null);
    // A sign-out that did not happen leaves everything as it was.
    if (!answer || answer.error) return;
    // The API forgot this browser's push with the session: the browser lets go of it too.
    await leftPushHere();
    // What was loaded for the account must not outlive the session: whoever signs out goes
    // back to the landing page. Whatever was unsaved was asked about before the session ended.
    queryClient.clear();
    // Nor what the account looked at last, which this browser kept a copy of.
    clearRecents();
    void navigate({ to: "/", ignoreBlocker: true });
  };

  return () => leaveWith(() => void signOut());
}
