import { router } from "expo-router";
import { NativeTabs } from "expo-router/native-tabs";

import { useAccountStart } from "@/components/account/account-start";
import { LoginWall, useVisitorWall } from "@/components/auth/login-wall";
import { useQuickActions } from "@/lib/quick-actions";
import { m } from "@/paraglide/messages";

/**
 * The four tabs of decision 040, the platform's own, and the "+" beside them: a tab that opens the
 * sheet of what to add, and is never a screen of its own.
 */
export default function TabsLayout() {
  useAccountStart();
  // The quick actions of the app's icon open their route over the tabs (decision 074).
  useQuickActions();
  // While the instance is closed to visitors, a visitor meets the wall, with no tabs (decision 039).
  if (useVisitorWall()) return <LoginWall />;
  return (
    <NativeTabs
      screenListeners={({ route }) => ({
        tabPress: () => {
          if (route.name === "add") router.push("/create");
        },
      })}
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon sf={{ default: "map", selected: "map.fill" }} md="map" />
        <NativeTabs.Trigger.Label>{m.nav_map()}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="saved">
        <NativeTabs.Trigger.Icon
          sf={{ default: "bookmark", selected: "bookmark.fill" }}
          md="bookmark"
        />
        <NativeTabs.Trigger.Label>{m.saved_title()}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="alerts">
        <NativeTabs.Trigger.Icon
          sf={{ default: "bell", selected: "bell.fill" }}
          md="notifications"
        />
        <NativeTabs.Trigger.Label>{m.alerts_title()}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="account">
        <NativeTabs.Trigger.Icon sf={{ default: "person", selected: "person.fill" }} md="person" />
        <NativeTabs.Trigger.Label>{m.account_menu()}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="add" disabled>
        <NativeTabs.Trigger.Icon sf="plus" md="add" />
        <NativeTabs.Trigger.Label hidden>{m.nav_add()}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
