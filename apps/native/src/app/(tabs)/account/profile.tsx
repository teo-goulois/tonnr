import { Redirect } from "expo-router";

import { ProfileStep } from "@/components/profile/profile-form";
import { useAccount } from "@/lib/account";

/** What the account says of itself as a surfer, to change: decision 063. An account's alone. */
export default function ProfileScreen() {
  const { signedIn, pending } = useAccount();
  if (!pending && !signedIn) return <Redirect href="/account" />;
  return <ProfileStep />;
}
