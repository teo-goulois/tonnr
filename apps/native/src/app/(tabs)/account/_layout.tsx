import { Stack } from "expo-router";

import { tabStackOptions } from "@/components/ui/stack-options";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

/** A step opened by a link stands over the tab's first screen, which its back goes to. */
export const unstable_settings = { anchor: "index" };

/**
 * The tab of the account: who is signed in, and the settings, one step into it each (decision
 * 040). A stack of its own, so that a step goes back with the platform's own gesture. The tab
 * opens on a large title, as a phone's settings do, and each step has its title in the bar.
 */
export default function Layout() {
  const theme = useTheme();
  return (
    <Stack screenOptions={tabStackOptions(theme)}>
      <Stack.Screen name="index" options={{ title: m.account_menu(), headerLargeTitle: true }} />
    </Stack>
  );
}
