import {
  BellFillIcon,
  BellIcon,
  BookmarkFillIcon,
  BookmarkIcon,
  MapFillIcon,
  MapIcon,
  PersonFillIcon,
  PersonIcon,
  PlusIcon,
} from "@repo/ui/icon";
import { router, useGlobalSearchParams, useNavigation, usePathname } from "expo-router";
import { NativeTabs } from "expo-router/native-tabs";
import { type ReactElement, useEffect } from "react";
import { type ImageSourcePropType, Platform } from "react-native";

import { useAccountStart } from "@/components/account/account-start";
import { LoginWall, useVisitorWall } from "@/components/auth/login-wall";
import { aloneOf, mapRouteOf, type TabsState } from "@/components/lists/alone";
import { placeOf, TAB_ROUTES, tabUnder } from "@/components/map/place-route";
import type { GlyphIcon } from "@/components/shared/glyph";
import { type PaintedImage, paintedIcon } from "@/components/shared/painted-icon";
import { useQuickActions } from "@/lib/quick-actions";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

// What the bar takes from the web's where it rests on how a platform draws an app's own tab, each
// a switch to turn off alone if a version of iOS or Android draws it wrong: the web's Nucleo art
// for the four tabs, painted to images, in the place of SF Symbols and Material Symbols; and the
// "+" standing apart from the tabs, as iOS 26 detaches its search tab and iOS 27 the tab it is told
// is prominent. Téo asked on 2026-10-22 that the app look as much as it can like the web's.
const NUCLEO_TABS = true;
const PLUS_APART_IOS_26 = true;
const PLUS_APART_IOS_27 = true;

const IOS = Platform.OS === "ios" ? Number.parseInt(String(Platform.Version), 10) : 0;
// iOS 26 draws its search tab apart, on a glass disc of its own and with no title: through
// `UITabBarItem`'s search item, and on 26.1 and later through `UISearchTab` too. A tab's role never
// changes while it is mounted, which a constant keeps.
const plusAsSearch = PLUS_APART_IOS_26 && IOS === 26;
// iOS 27 detaches the search tab only while it starts a search, and any tab named prominent.
const plusProminent = PLUS_APART_IOS_27 && IOS >= 27;

// The web's art is 22 points (`size-5.5` in `BottomNav`), and its "+" holds its plus at 20
// (`icon-xl`'s `size-5`). Material draws a tab's icon in a box of 24, to which it would widen the
// art: on Android each is painted in the middle of that box, and the "+" fills it with its disc.
const ART = 22;
const PLUS = 20;
const ANDROID_BOX = 24;
const ANDROID_PLUS = 14;
const box = Platform.OS === "android" ? ANDROID_BOX : ART;

type TabArt = { default: ImageSourcePropType; selected: ImageSourcePropType };
type TabName = "index" | "saved" | "alerts" | "account";

let tabArt: Record<TabName, TabArt> | null | undefined;

/**
 * The art of the four tabs, as the web's: a line, filled while it is the tab in view. Painted once,
 * in black, which the bar tints in its two greys as it tinted the symbols, and null when one could
 * not be painted: the bar then keeps the platform's symbols.
 */
function paintedTabs(): Record<TabName, TabArt> | null {
  if (tabArt !== undefined) return tabArt;
  const pair = (line: GlyphIcon, fill: GlyphIcon): TabArt | null => {
    const drawn = paintedIcon(line, { size: ART, box, color: "#000" });
    const filled = paintedIcon(fill, { size: ART, box, color: "#000" });
    return drawn && filled ? { default: drawn.source, selected: filled.source } : null;
  };
  const index = pair(MapIcon, MapFillIcon);
  const saved = pair(BookmarkIcon, BookmarkFillIcon);
  const alerts = pair(BellIcon, BellFillIcon);
  const account = pair(PersonIcon, PersonFillIcon);
  tabArt = index && saved && alerts && account ? { index, saved, alerts, account } : null;
  return tabArt;
}

// The platform's symbols, which the bar draws when the art could not be painted.
const SYMBOLS: Record<TabName, ReactElement> = {
  index: <NativeTabs.Trigger.Icon sf={{ default: "map", selected: "map.fill" }} md="map" />,
  saved: (
    <NativeTabs.Trigger.Icon
      sf={{ default: "bookmark", selected: "bookmark.fill" }}
      md="bookmark"
    />
  ),
  alerts: (
    <NativeTabs.Trigger.Icon sf={{ default: "bell", selected: "bell.fill" }} md="notifications" />
  ),
  account: (
    <NativeTabs.Trigger.Icon sf={{ default: "person", selected: "person.fill" }} md="person" />
  ),
};

const plusArt = new Map<string, PaintedImage | null>();

/**
 * The "+" in the web's colors, painted once for each theme: on iOS its plus alone in the theme's
 * accent, `color-1`, which iOS 26 and later stand on a glass disc of their own; on Android the
 * web's disc of `color-1` with its plus in `neutral-1`, which Material's bar draws as painted.
 */
function paintedPlus(accent: string, ground: string) {
  const key = `${accent} ${ground}`;
  if (!plusArt.has(key)) {
    plusArt.set(
      key,
      Platform.OS === "android"
        ? paintedIcon(PlusIcon, {
            size: ANDROID_PLUS,
            box: ANDROID_BOX,
            color: ground,
            disc: accent,
            // Its lines as thick on the small disc as the web's on its own.
            props: { strokeWidth: 2.5 },
          })
        : paintedIcon(PlusIcon, { size: PLUS, color: accent }),
    );
  }
  return plusArt.get(key) ?? null;
}

/**
 * The four tabs of decision 040, the platform's own, and the "+" beside them: a tab that opens the
 * sheet of what to add, and is never a screen of its own. It is disabled, so that neither system
 * selects it, and both tell its press to the tabs' listeners, which open the sheet. Its label is
 * hidden, so a screen reader is given its name.
 *
 * The bar is drawn in the web's `BottomNav` colors, type and art: a tab's name and its Nucleo
 * line in the theme's seventh grey, the one in view in its ink and filled, every name in Geist
 * medium at the theme's `xs` and always shown, as Android hides them otherwise past three tabs.
 * The "+" is the web's accent, standing apart from the tabs where iOS draws a tab apart. The count
 * of what was not read stands on the theme's accent, as the web's, where iOS lets the badge's
 * white figures read: in a dark theme its accent is light, and iOS keeps its own red there.
 */
export default function TabsLayout() {
  const { colors, fonts, type, scheme } = useTheme();
  useAccountStart();
  // The quick actions of the app's icon open their route over the tabs (decision 074).
  useQuickActions();
  // While the instance is closed to visitors, a visitor meets the wall, with no tabs (decision 039),
  // except on a list opened by its link, in the saved tab or alone on the map, and the places it
  // holds, which open then too, as the web's ?shared= does: the wall comes back once the visitor
  // leaves the list for another tab. The map's own link counts while the map, or a place's sheet
  // over it, is in view.
  const walled = useVisitorWall();
  const pathname = usePathname();
  const root = useNavigation<Navigation>();
  useTabUnder(pathname, root);
  const { shared } = useGlobalSearchParams<{ shared?: string }>();
  const onMap = pathname === "/" || placeOf(pathname) !== undefined;
  const byLink =
    pathname.startsWith("/saved/shared/") ||
    Boolean(shared) ||
    (onMap && mapLinkOf(root) !== undefined);
  if (walled && !byLink) return <LoginWall />;

  const tabs = NUCLEO_TABS ? paintedTabs() : null;
  const iconOf = (name: TabName) =>
    tabs ? <NativeTabs.Trigger.Icon src={tabs[name]} renderingMode="template" /> : SYMBOLS[name];
  const plus = paintedPlus(colors["color-1"], colors["neutral-1"]);
  // Android drops the rendering mode of an image tab, and would tint the disc in the bar's grey:
  // the disc is given to the tab as the platform takes it, kept as painted.
  const plusOnAndroid = plus && {
    type: "imageSource" as const,
    imageSource: plus.source,
    tinting: "original" as const,
  };

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
      {...(plusProminent && { unstable_nativeProps: { ios: { prominentScreenKey: "add" } } })}
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
        {iconOf("index")}
        <NativeTabs.Trigger.Label>{m.nav_map()}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="saved">
        {iconOf("saved")}
        <NativeTabs.Trigger.Label>{m.saved_title()}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="alerts">
        {iconOf("alerts")}
        <NativeTabs.Trigger.Label>{m.alerts_title()}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="account">
        {iconOf("account")}
        <NativeTabs.Trigger.Label>{m.account_menu()}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger
        name="add"
        disabled
        accessibilityLabel={m.nav_add()}
        {...(plusAsSearch && { role: "search" as const })}
        unstable_nativeProps={{
          ...(plusAsSearch && { ios: { role: "search" as const } }),
          ...(Platform.OS === "android" &&
            plusOnAndroid && { android: { icon: plusOnAndroid, selectedIcon: plusOnAndroid } }),
        }}
      >
        {plus ? (
          <NativeTabs.Trigger.Icon src={plus.source} renderingMode="original" />
        ) : (
          <NativeTabs.Trigger.Icon sf="plus" md="add" />
        )}
        <NativeTabs.Trigger.Label hidden>{m.nav_add()}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

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

/** The link of the list the map shows alone, read from the tabs, whatever screen is in front. */
function mapLinkOf(root: Navigation) {
  const alone = aloneOf(mapRouteOf(tabsOf(root))?.params);
  return alone && "shared" in alone ? alone.shared : undefined;
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
