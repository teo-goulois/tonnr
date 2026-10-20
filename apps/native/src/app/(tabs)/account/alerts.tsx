import { Redirect } from "expo-router";

import { AlertSettingsStep } from "@/components/account/alert-settings";
import { useAccount } from "@/lib/account";

/** How the account wants to be told of its alerts, one step into its tab (decisions 031 and 040). */
export default function AlertSettingsScreen() {
  const { signedIn, pending } = useAccount();
  if (!pending && !signedIn) return <Redirect href="/account" />;
  return <AlertSettingsStep />;
}
