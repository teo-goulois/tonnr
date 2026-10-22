import { useLocalSearchParams } from "expo-router";

import { Onboarding } from "@/components/profile/onboarding";

/**
 * What the account says of itself as a surfer, asked once in a dialog over the map (decision
 * 063). `?sample=1` opens the design system's, which keeps nothing, in development only.
 */
export default function OnboardingScreen() {
  const { sample } = useLocalSearchParams<{ sample?: string }>();
  return <Onboarding sample={__DEV__ && sample === "1"} />;
}
