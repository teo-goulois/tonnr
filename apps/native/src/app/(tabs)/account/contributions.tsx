import { Stack } from "expo-router";

import { ContributionsScreen } from "@/components/contributions/contributions-screen";
import { m } from "@/paraglide/messages";

/** What the account wrote of the breaks, and its rank (decision 041). */
export default function Screen() {
  return (
    <>
      <Stack.Screen options={{ title: m.contributions_title() }} />
      <ContributionsScreen />
    </>
  );
}
