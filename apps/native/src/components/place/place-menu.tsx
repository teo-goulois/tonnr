import MenuView, { type MenuAction, type MenuComponentRef } from "@expo/ui/community/menu";
import { DIRECTIONS_APPS, type DirectionsApp, directionsUrl } from "@repo/client/directions";
import { APP_NAME } from "@repo/config/app";
import { MoreHorizontalIcon } from "@repo/ui/icon";
import { router } from "expo-router";
import { useRef } from "react";
import { Linking, Platform, View } from "react-native";

import { placeLinkOf } from "@/components/lists/links";
import { confirmDestructive } from "@/components/saved/confirm";
import { IconButton } from "@/components/ui/button";
import { ENV } from "@/env";
import type { Route } from "@/lib/links";
import { useRequireAccount } from "@/lib/require-account";
import { shareLink } from "@/lib/share";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";

import { leavesOf, type MenuGroup, menuActions } from "./menu-actions";
import type { PlaceKind } from "./tabs";
import type { PlaceRecord } from "./use-place";
import { useSpotActions } from "./use-spot";

// What is seldom done with a place, in the platform's own menu, which opens from the button of
// the head as the web's `PlaceMenu` and `SpotActions` open theirs, with plain words and the web's
// separators: begin an alert there (decision 064), send its short address through the platform's
// share sheet (decision 056), go there with a map app, and for a spot of the account's own,
// rename or move it, ask that it be made public or take the request back, and delete it, which
// is asked first (decision 034). What needs words, the name and the word for the moderator, is
// written in a sheet that the menu opens.

// An app's name, which its maker gives it in each language.
const APP_NAMES: Record<DirectionsApp, () => string> = {
  apple: m.directions_apple,
  google: () => "Google Maps",
  waze: () => "Waze",
};
// Apple's maps live on Apple's phones: elsewhere their address opens a page.
const APPS = DIRECTIONS_APPS.filter((app) => app !== "apple" || Platform.OS === "ios");
const DIRECTIONS = "directions:";

export function PlaceMenu({
  kind,
  id,
  record,
  onAlert,
  onDeleted,
}: {
  kind: PlaceKind;
  id: string;
  record: PlaceRecord;
  /** Shows the place's alerts, as the web's panel turns to them while an alert is written. */
  onAlert: () => void;
  /** Closes the place's sheet, once its spot is deleted. */
  onDeleted: () => void;
}) {
  const requireAccount = useRequireAccount();
  const actions = useSpotActions();
  const menu = useRef<MenuComponentRef>(null);
  const name = record.name ?? "";
  const spot = record.isOwner ? record.spot : undefined;
  const status = spot?.publication?.status;
  // What an alert is set on: a surf break of the catalogue, or a spot of the account's own.
  const alertPlace =
    kind === "break" && record.found ? `break:${id}` : spot ? `spot:${id}` : undefined;
  // A spot of an account's own is sent in a shared list, never by an address of its own.
  const url = placeLinkOf(ENV.EXPO_PUBLIC_SITE_URL, getLocale(), { kind, id });
  // A station has no way to it: the sea is read there, not surfed.
  const destination = kind === "station" ? undefined : record.point;

  const groups: MenuGroup[] = [
    {
      actions: [
        ...(alertPlace ? [{ id: "alert", title: m.alert_create() }] : []),
        ...(url ? [{ id: "share", title: m.place_share() }] : []),
      ],
    },
    {
      title: m.directions_choose(),
      actions: destination
        ? APPS.map((app) => ({ id: `${DIRECTIONS}${app}`, title: APP_NAMES[app]() }))
        : [],
    },
    {
      actions: spot
        ? [
            { id: "edit", title: m.spot_edit() },
            ...(status === "pending"
              ? [
                  {
                    id: "unpublish",
                    title: m.spot_publish_cancel(),
                    attributes: { disabled: actions.isPublishing },
                  },
                ]
              : // A spot that is public already is not asked for again.
                status !== "accepted"
                ? [{ id: "publish", title: m.spot_publish() }]
                : []),
          ]
        : [],
    },
    {
      actions: spot
        ? [
            {
              id: "delete",
              title: m.action_delete(),
              attributes: { destructive: true, disabled: actions.isRemoving },
            },
          ]
        : [],
    },
  ];
  const all: MenuAction[] = menuActions(groups, Platform.OS === "android" ? "android" : "ios");
  if (all.length === 0) return null;

  async function act(action: string) {
    if (action === "alert" && alertPlace) {
      const next = `/alert/new?place=${encodeURIComponent(alertPlace)}` as Route;
      // A visitor has no alerts tab yet: the sheet turns to it once there is an account, as the
      // web's panel turns to the alert it begins once signed in.
      requireAccount(
        m.auth_reason_add_alert(),
        () => {
          onAlert();
          router.push(next);
        },
        next,
      );
    } else if (action === "share" && url) {
      await shareLink({ title: name, message: m.place_share_text({ name, app: APP_NAME }), url });
    } else if (action.startsWith(DIRECTIONS) && destination) {
      const app = APPS.find((one) => `${DIRECTIONS}${one}` === action);
      // A web address that the app answers when it is installed, and its site when it is not.
      if (app) Linking.openURL(directionsUrl(app, destination)).catch(() => {});
    } else if (action === "edit" && spot) {
      router.push({ pathname: "/place/move", params: { id: spot.id } });
    } else if (action === "publish" && spot) {
      router.push({ pathname: "/place/publish", params: { id: spot.id } });
    } else if (action === "unpublish" && spot) {
      actions.cancelPublication(spot, () => {});
    } else if (action === "delete" && spot) {
      const sure = await confirmDestructive({
        title: m.spot_delete_title({ name: spot.name }),
        message: status === "accepted" ? m.spot_delete_text_public() : m.spot_delete_text(),
        confirm: m.action_delete(),
      });
      // The spot's sheet goes with it.
      if (sure) actions.remove(spot, onDeleted);
    }
  }

  const label = m.spot_menu({ name: name || m.spot_title() });
  // What the menu offers is offered to a screen reader too, among the button's actions. Android's
  // reader opens the menu itself; iOS's presses the button, which opens it.
  const spoken = [
    ...(Platform.OS === "android" ? [{ name: "activate" }] : []),
    ...leavesOf(all).map((action) => ({ name: action.id ?? action.title, label: action.title })),
  ];

  return (
    <MenuView
      ref={menu}
      actions={all}
      onPressAction={({ nativeEvent }) => void act(nativeEvent.event)}
    >
      {/* Drawn as the head's other buttons. The menu takes the press: the button under it takes
          none. */}
      <View
        pointerEvents="none"
        accessible
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityActions={spoken}
        onAccessibilityAction={(event) => {
          const action = event.nativeEvent.actionName;
          if (action === "activate") menu.current?.show();
          else void act(action);
        }}
      >
        <IconButton
          variant="ghost"
          icon={MoreHorizontalIcon}
          label={label}
          loading={actions.isRemoving}
        />
      </View>
    </MenuView>
  );
}
