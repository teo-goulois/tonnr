import { Stack, useNavigation } from "expo-router";
import { useEffect } from "react";

import { useUnreadCount } from "@/components/alerts/use-news";
import { m } from "@/paraglide/messages";

/**
 * The tab of the alerts: what they told, and the alerts themselves (decision 031). A stack of its
 * own, so that a step into it goes back with the platform's own gesture. The tab counts what the
 * account has not read, as the web's bar does: the native tab's own badge, set from here, since
 * every tab is drawn as the app starts (decision 072).
 */
export default function Layout() {
  const navigation = useNavigation();
  const unread = useUnreadCount();
  useEffect(() => {
    navigation.setOptions({
      badgeValue: unread > 0 ? String(unread) : undefined,
      tabBarItemAccessibilityLabel:
        unread > 0 ? m.alerts_title_unread({ count: unread }) : m.alerts_title(),
    });
  }, [navigation, unread]);
  return <Stack screenOptions={{ headerLargeTitle: true, headerTransparent: false }} />;
}
