import { Stack } from "expo-router";

import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

/**
 * The tab of the account: who is signed in, and the settings, one step into it each (decision
 * 040). A stack of its own, so that a step goes back with the platform's own gesture. The tab
 * opens on a large title, as a phone's settings do, and each step has its title in the bar.
 */
export default function Layout() {
  const { colors, fonts } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerTransparent: false,
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors["cte-canvas"] },
        headerTitleStyle: { fontFamily: fonts.medium },
        headerLargeTitleStyle: { fontFamily: fonts.heavy },
        headerBackButtonDisplayMode: "minimal",
      }}
    >
      <Stack.Screen name="index" options={{ title: m.account_menu(), headerLargeTitle: true }} />
    </Stack>
  );
}
