import { Stack, useNavigation } from "expo-router";
import { useEffect } from "react";

import { unreadBadge } from "@repo/client/phone-nav";

import { useUnreadCount } from "@/components/alerts/use-news";
import { tabStackOptions } from "@/components/ui/stack-options";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

/** A step opened by a link stands over the tab's first screen, which its back goes to. */
export const unstable_settings = { anchor: "index" };

/**
 * The tab of the alerts: what they told, and the alerts themselves (decision 031). A stack of its
 * own, so that a step into it goes back with the platform's own gesture. The tab counts what the
 * account has not read, as the web's bar does: the native tab's own badge, set from here, since
 * every tab is drawn as the app starts (decision 072).
 */
export default function Layout() {
  const theme = useTheme();
  const navigation = useNavigation();
  const unread = useUnreadCount();
  useEffect(() => {
    navigation.setOptions({
      // "9+" past nine, as the web's bar writes it.
      badgeValue: unreadBadge(unread),
      tabBarItemAccessibilityLabel:
        unread > 0 ? m.alerts_title_unread({ count: unread }) : m.alerts_title(),
    });
  }, [navigation, unread]);
  return (
    <Stack screenOptions={tabStackOptions(theme)}>
      <Stack.Screen name="index" options={{ title: m.alerts_title(), headerLargeTitle: true }} />
    </Stack>
  );
}
