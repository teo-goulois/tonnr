import { APP_NAME } from "@repo/config/app";
import {
  ArrowRightIcon,
  BellIcon,
  BookmarkIcon,
  ListsIcon,
  ShareIcon,
  TrashIcon,
} from "@repo/ui/icon";
import { type Link, router } from "expo-router";
import { type ComponentProps, useState } from "react";
import { Platform } from "react-native";

import { placeHref } from "@/components/map/place-route";
import { openPlaceOnMap } from "@/components/sessions/session-place";
import type { GlyphIcon } from "@/components/shared/glyph";
import { feel } from "@/components/ui/haptics";
import { useTell } from "@/components/ui/toast";
import { ENV } from "@/env";
import { useRequireAccount } from "@/lib/require-account";
import { shareLink } from "@/lib/share";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";

import { placeLinkOf } from "@/components/lists/links";
import { useListMutations } from "@/components/lists/use-list-mutations";

import { ActionSheet, type SheetContent } from "./action-sheet";
import { type ActionKey, actionsOf, type ListChoice, type RowContext } from "./actions";
import { chooseOnIos } from "./confirm";
import type { PlaceRef } from "./sea-now";

// What a place's row does, wherever it stands: the saved tab, a list shown alone, a list opened
// by its link. One set of actions, which iOS lists in the system's context menu, Android in its
// sheet, and a screen reader among the row's own actions. A press opens the place, on the map
// from the saved tab, as the web's address does (decision 040).

/** A place as a row shows it: what it is, and the name it is read by. */
export type PlaceItem = { ref: PlaceRef; name: string };

/**
 * Opens a place's sheet over the map, as a press on its marker does: the map's tab first, with
 * the list it shows alone, which the web's address keeps, then the place (decisions 040 and 069).
 */
export function openOnMap(place: PlaceRef, list: string | undefined) {
  const href = placeHref(place.kind, place.id);
  if (!list) return openPlaceOnMap(href);
  // The map's tab takes the parameters it is navigated to: the list is given again, or it is lost.
  router.navigate({ pathname: "/", params: { list } });
  router.push(href);
}

/** A symbol of SF Symbols, which iOS's menu draws. */
export type SFSymbol = NonNullable<ComponentProps<typeof Link.MenuAction>["icon"]>;

type Look = { label: () => string; icon: GlyphIcon; symbol: SFSymbol; destructive?: boolean };

/** What each action is called and drawn with: Nucleo's icons where the app draws, SF Symbols in iOS's menu. */
export const ACTION_LOOKS: Record<ActionKey, Look> = {
  open: { label: m.native_open, icon: ArrowRightIcon, symbol: "arrow.right.circle" },
  move: { label: m.native_move_to, icon: ListsIcon, symbol: "list.bullet" },
  alert: { label: m.alert_create, icon: BellIcon, symbol: "bell" },
  share: { label: m.place_share, icon: ShareIcon, symbol: "square.and.arrow.up" },
  remove: { label: m.native_remove, icon: TrashIcon, symbol: "trash", destructive: true },
};

export function usePlaceActions({ open }: { open: (place: PlaceRef) => void }) {
  const tell = useTell();
  const lists = useListMutations();
  const requireAccount = useRequireAccount();
  const [sheet, setSheet] = useState<SheetContent | null>(null);
  const close = () => setSheet(null);

  async function share({ ref, name }: PlaceItem) {
    const url = placeLinkOf(ENV.EXPO_PUBLIC_SITE_URL, getLocale(), ref);
    if (!url) return;
    await shareLink({ title: name, message: m.place_share_text({ name, app: APP_NAME }), url });
  }

  function setAlert({ ref }: PlaceItem) {
    requireAccount(m.auth_reason_add_alert(), () =>
      router.push({ pathname: "/alert/new", params: { place: `${ref.kind}:${ref.id}` } }),
    );
  }

  // Taken out at once, as the web's X does, with nothing said: what failed is told, and the lists
  // are read again.
  function remove({ ref }: PlaceItem, list: ListChoice) {
    void lists.removeAtOnce(list.id, ref).catch(() => {});
  }

  async function move({ ref, name }: PlaceItem, from: ListChoice, to: ListChoice) {
    const wasThere = lists.holdsPlace(to.id, ref);
    try {
      await lists.addPlace(to.id, ref);
      await lists.removePlace(from.id, ref);
    } catch {
      return;
    }
    tell({
      title: m.native_moved_to({ place: name, list: to.name }),
      tone: "success",
      action: {
        label: m.native_undo(),
        onPress: () => {
          feel("select");
          void (async () => {
            await lists.addPlace(from.id, ref);
            if (!wasThere) await lists.removePlace(to.id, ref);
          })().catch(() => {});
        },
      },
    });
  }

  /** Asks which list to move a place to: iOS's action sheet, or Android's own. */
  async function chooseMove(item: PlaceItem, context: RowContext, back?: () => void) {
    const from = context.list;
    const others = context.others ?? [];
    if (!from || others.length === 0) return;
    if (Platform.OS === "ios") {
      const index = await chooseOnIos(
        m.native_move_to(),
        others.map((list) => list.name),
      );
      const to = index === undefined ? undefined : others[index];
      if (to) void move(item, from, to);
      return;
    }
    setSheet({
      title: m.native_move_to(),
      onBack: back,
      items: others.map((to) => ({
        key: to.id,
        label: to.name,
        icon: BookmarkIcon,
        onPress: () => {
          close();
          void move(item, from, to);
        },
      })),
    });
  }

  /** Does what a row offers. */
  function run(key: ActionKey, item: PlaceItem, context: RowContext) {
    switch (key) {
      case "open":
        return open(item.ref);
      case "move":
        return void chooseMove(item, context);
      case "alert":
        return setAlert(item);
      case "share":
        return void share(item);
      case "remove":
        return context.list ? remove(item, context.list) : undefined;
    }
  }

  /** Opens Android's sheet of what a row offers, after a long press. */
  function showSheet(item: PlaceItem, context: RowContext) {
    feel("hold");
    const actions: SheetContent = {
      title: item.name,
      items: actionsOf(item.ref, context).map((key) => ({
        key,
        label: ACTION_LOOKS[key].label(),
        icon: ACTION_LOOKS[key].icon,
        destructive: ACTION_LOOKS[key].destructive,
        onPress: () => {
          if (key === "move") return void chooseMove(item, context, () => setSheet(actions));
          close();
          run(key, item, context);
        },
      })),
    };
    setSheet(actions);
  }

  return {
    run,
    move,
    remove,
    showSheet,
    /** Android's sheet, drawn once by the screen. */
    sheet: <ActionSheet content={sheet} onClose={close} />,
  };
}

export type PlaceActions = ReturnType<typeof usePlaceActions>;
