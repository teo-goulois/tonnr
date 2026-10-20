import { Stack } from "expo-router";

import { BlockedScreen } from "@/components/friends/blocked-screen";
import { m } from "@/paraglide/messages";

/** The accounts this one blocked (decision 071). */
export default function Screen() {
  return (
    <>
      <Stack.Screen options={{ title: m.blocks_title() }} />
      <BlockedScreen />
    </>
  );
}
