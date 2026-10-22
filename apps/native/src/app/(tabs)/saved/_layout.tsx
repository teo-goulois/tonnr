import { Stack } from "expo-router";

import { tabStackOptions } from "@/components/ui/stack-options";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

/** A step opened by a link stands over the tab's first screen, which its back goes to. */
export const unstable_settings = { anchor: "index" };

/** The tab of what is saved: the lists, the spots, what was looked at last (decisions 017 and 042). A stack of its own, so that a step into it goes back with the platform's own gesture. */
export default function Layout() {
  const theme = useTheme();
  return (
    <Stack screenOptions={tabStackOptions(theme)}>
      <Stack.Screen name="index" options={{ title: m.saved_title(), headerLargeTitle: true }} />
    </Stack>
  );
}
