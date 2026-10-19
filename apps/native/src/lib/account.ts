import { authClient } from "./auth-client";

/**
 * Who uses the app: an account, signed in through the sign-in library, or a visitor (decision
 * 039). `pending` while the session kept on the phone is read. A screen that needs an account
 * asks for one with `useRequireAccount` (src/lib/require-account.ts).
 */
export function useAccount() {
  const session = authClient.useSession();
  const user = session.data?.user;
  return {
    pending: session.isPending,
    signedIn: user !== undefined,
    userId: user?.id,
    email: user?.email,
    // The username, which is what others read of an account (decision 041); null until chosen.
    username: (user as { username?: string | null } | undefined)?.username ?? null,
  };
}
