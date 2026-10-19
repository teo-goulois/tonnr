import { router } from "expo-router";
import { NativeTabs } from "expo-router/native-tabs";

import { m } from "@/paraglide/messages";

/**
 * The four tabs of decision 040, the platform's own, and the "+" beside them: a tab that opens the
 * sheet of what to add, and is never a screen of its own.
 */
export default function TabsLayout() {
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
