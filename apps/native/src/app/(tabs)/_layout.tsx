import { router, useGlobalSearchParams, useNavigation, usePathname } from "expo-router";
import { NativeTabs } from "expo-router/native-tabs";
import { useEffect } from "react";
import { Platform } from "react-native";

import { useAccountStart } from "@/components/account/account-start";
import { LoginWall, useVisitorWall } from "@/components/auth/login-wall";
import { TAB_ROUTES, tabUnder } from "@/components/map/place-route";
import { useQuickActions } from "@/lib/quick-actions";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

/**
 * The four tabs of decision 040, the platform's own, and the "+" beside them: a tab that opens the
 * sheet of what to add, and is never a screen of its own. It is disabled, so that neither system
 * selects it, and both tell its press to the tabs' listeners, which open the sheet. Its label is
 * hidden, so a screen reader is given its name.
 *
 * The bar is drawn in the web's `BottomNav` colors and type: a tab's name and icon in the theme's
 * seventh grey, the one in view in its ink, every name in Geist medium at the theme's `xs` and
 * always shown, as Android hides them otherwise past three tabs. The count of what was not read
 * stands on the theme's accent, as the web's, where iOS lets the badge's white figures read: in
 * a dark theme its accent is light, and iOS keeps its own red there.
 */
export default function TabsLayout() {
  const { colors, fonts, type, scheme } = useTheme();
  useAccountStart();
  // The quick actions of the app's icon open their route over the tabs (decision 074).
  useQuickActions();
  // While the instance is closed to visitors, a visitor meets the wall, with no tabs (decision 039),
  // except on a list opened by its link, in the saved tab or alone on the map, and the places it
  // holds, which open then too, as the web's ?shared= does: the wall comes back once the visitor
  // leaves the list for another tab.
  const walled = useVisitorWall();
  const pathname = usePathname();
  const root = useNavigation<Navigation>();
  useTabUnder(pathname, root);
  const { shared } = useGlobalSearchParams<{ shared?: string }>();
  const byLink =
    pathname.startsWith("/saved/shared/") ||
    Boolean(shared) ||
    mapParamsOf(root).shared !== undefined;
  if (walled && !byLink) return <LoginWall />;
  return (
    <NativeTabs
      tintColor={colors["neutral-10"]}
      iconColor={{ default: colors["neutral-7"], selected: colors["neutral-10"] }}
      labelStyle={{
        default: { fontFamily: fonts.medium, fontSize: type.xs.size, color: colors["neutral-7"] },
        selected: { fontFamily: fonts.medium, fontSize: type.xs.size, color: colors["neutral-10"] },
      }}
      badgeBackgroundColor={
        Platform.OS === "android" || scheme === "light" ? colors["color-1"] : undefined
      }
      badgeTextColor={colors["neutral-1"]}
      backgroundColor={colors["neutral-1"]}
      indicatorColor={colors["neutral-3"]}
      rippleColor={colors["neutral-3-transparent"]}
      labelVisibilityMode="labeled"
      screenListeners={({ navigation, route }) => ({
        tabPress: () => {
          if (route.name === "add") router.push("/create");
          // A press on a tab navigates to it with no parameters, which takes away the map's: the
          // list it shows alone, by its id or by its link, is given back to it, as the web keeps
          // `?list=` and `?shared=` whatever tab is in view (`tabSearch` in
          // packages/client/src/phone-nav.ts).
          const alone = aloneOf(route.params);
          if (route.name === "index" && alone) {
            requestAnimationFrame(() =>
              navigation.dispatch({
                type: "SET_PARAMS",
                payload: { params: alone },
                source: route.key,
              }),
            );
          }
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
      <NativeTabs.Trigger name="add" disabled accessibilityLabel={m.nav_add()}>
        <NativeTabs.Trigger.Icon sf="plus" md="add" />
        <NativeTabs.Trigger.Label hidden>{m.nav_add()}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

type TabsState = {
  key: string;
  index: number;
  routes: readonly { name: string; params?: object | undefined }[];
};
/** The root's navigation, whose state holds the tabs'. */
type Navigation = {
  getState(): { routes: readonly { name: string; state?: unknown }[] } | undefined;
  dispatch(action: { type: string; payload: object; target?: string }): void;
};

/** The state of the tabs' navigator, from the root's, whose state holds it. */
function tabsOf(root: Navigation) {
  return root.getState()?.routes.find((one) => one.name === "(tabs)")?.state as
    | TabsState
    | undefined;
}

/** The list a route of the map shows alone, by its id or by its link, as its parameters say it. */
function aloneOf(params: object | undefined) {
  const { list, shared } = (params ?? {}) as { list?: unknown; shared?: unknown };
  if (typeof shared === "string" && shared) return { shared };
  if (typeof list === "string" && list) return { list };
  return undefined;
}

/** What the map's route shows alone, read from the tabs, whatever screen is in front. */
function mapParamsOf(root: Navigation): { list?: string; shared?: string } {
  const map = tabsOf(root)?.routes.find((one) => one.name === TAB_ROUTES.map);
  return aloneOf(map?.params) ?? {};
}

/**
 * Shows the tab a screen over the tabs shows under it: a place opened from the saved tab, an
 * alert, a notification or a link is read on the map, as the web's address shows whatever is
 * selected on the map (`tabOf` in packages/client/src/phone-nav.ts). The tab is changed under the
 * sheet, which stays where it is.
 */
function useTabUnder(pathname: string, root: Navigation) {
  const wanted = tabUnder(pathname);
  useEffect(() => {
    if (!wanted) return;
    const tabs = tabsOf(root);
    const name = TAB_ROUTES[wanted];
    if (!tabs || tabs.routes[tabs.index]?.name === name) return;
    root.dispatch({ type: "JUMP_TO", payload: { name }, target: tabs.key });
  }, [wanted, root]);
}
