import type { JoinedList, SavedList } from "@repo/client/viewer/types";
import { LockIcon, PinPlusIcon, ShareIcon, TrashIcon } from "@repo/ui/icon";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { type ReactNode, useEffect, useState } from "react";
import { RefreshControl, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { AccountPrompt } from "@/components/auth/account-prompt";
import {
  type ChipList,
  chipsOf,
  listName,
  othersOf,
  savedRefsOf,
  sizeOf,
} from "@/components/lists/items";
import { ListChips } from "@/components/lists/list-chips";
import { useListInView } from "@/components/lists/list-in-view";
import { ListPanel } from "@/components/lists/list-panel";
import { NewListField } from "@/components/lists/new-list-field";
import { useListMutations } from "@/components/lists/use-list-mutations";
import { JoinedLists } from "@/components/saved/joined-lists";
import { type PlaceActions, openOnMap, usePlaceActions } from "@/components/saved/place-actions";
import { PlaceRows, RowsWaiting, SectionHeader } from "@/components/saved/place-section";
import { RecentPlaces } from "@/components/saved/recent-places";
import { useSavedPlaces } from "@/components/saved/use-saved-places";
import { Glyph } from "@/components/shared/glyph";
import { Button, IconButton } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Text } from "@/components/ui/text";
import { useAccount } from "@/lib/account";
import { useRecentPlaces } from "@/lib/recents";
import { useTheme } from "@/lib/theme";
import { useNow } from "@/lib/use-now";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

/**
 * What is saved, the web's `SavedPanel` as a phone's tab (decisions 017, 040 and 042): the chips
 * of the lists, what was looked at last, the account's own spots, then each list, the favorites
 * first, with what shares it, what deletes it and what takes a place out of it, the lists of
 * others that it kept, and a new list. A chip shows that list alone, here as the web's
 * `ListPanel` and on the map, which reads the same `?list=`. A place opens on the map. Pulled
 * down, everything is read again. A visitor is asked for an account, and keeps what they looked
 * at.
 */
export default function SavedScreen() {
  const { signedIn, pending } = useAccount();
  const { colors, space } = useTheme();
  const queryClient = useQueryClient();
  const now = useNow();
  const inView = useListInView();
  const chosen = signedIn ? inView.list : undefined;
  // A place opens on the map, which goes on showing the list it shows alone.
  const actions = usePlaceActions({ open: (place) => openOnMap(place, chosen) });
  const recents = useRecentPlaces();
  const [refreshing, setRefreshing] = useState(false);

  const lists = useQuery({ ...orpc.v1.lists.list.queryOptions(), enabled: signedIn });
  const spots = useQuery({ ...orpc.v1.spots.list.queryOptions(), enabled: signedIn });

  // An address that names a list with the saved tab, `?list=<id>&panel=saved` on the web, shows
  // that list alone, here and on the map.
  const { list: asked } = useLocalSearchParams<{ list?: string }>();
  const { show } = inView;
  useEffect(() => {
    if (typeof asked !== "string" || !asked) return;
    show(asked);
    router.setParams({ list: undefined });
  }, [asked, show]);

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([
      // The lists, and the list shown alone.
      signedIn ? queryClient.invalidateQueries({ queryKey: orpc.v1.lists.key() }) : undefined,
      signedIn ? spots.refetch() : undefined,
      recents.refresh(),
      // What the stations read last, and the names of the breaks.
      queryClient.invalidateQueries({ queryKey: orpc.v1.stations.get.key() }),
      queryClient.invalidateQueries({ queryKey: orpc.v1.breaks.get.key() }),
    ]);
    setRefreshing(false);
  };

  const chips = chipsOf(lists.data?.lists ?? [], lists.data?.joined ?? []);
  const recentPlaces = (
    <RecentPlaces recents={recents.recents} now={now} actions={actions} onClear={recents.onClear} />
  );

  return (
    <>
      <KeyboardAwareScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        bottomOffset={space.m}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refresh()}
            tintColor={colors["neutral-7"]}
            colors={[colors["neutral-7"]]}
          />
        }
        contentContainerStyle={{ padding: space.m, gap: space.l }}
      >
        {pending ? (
          <RowsWaiting heading />
        ) : !signedIn ? (
          <>
            <AccountPrompt text={m.saved_sign_in_prompt()} next="/saved" />
            {recentPlaces}
          </>
        ) : chosen ? (
          <ChosenList
            key={chosen}
            id={chosen}
            own={lists.data?.lists.some((list) => list.id === chosen)}
            chips={chips}
            onPick={show}
            actions={actions}
            now={now}
          />
        ) : lists.isPending ? (
          <RowsWaiting heading />
        ) : (
          <Everything
            lists={lists.data?.lists ?? []}
            joined={lists.data?.joined ?? []}
            failed={lists.isError}
            onRetry={() => void lists.refetch()}
            retrying={lists.isFetching}
            spots={spots}
            chips={chips}
            onPick={show}
            actions={actions}
            now={now}
            recentPlaces={recentPlaces}
          />
        )}
      </KeyboardAwareScrollView>
      {actions.sheet}
    </>
  );
}

/** Opens what shares one of the account's lists. */
function shareList(id: string) {
  router.push({ pathname: "/list/share", params: { id } });
}

/** The account's own spots, as the tab reads them. */
type SpotsRead = {
  data: { spots: { id: string; name: string }[] } | undefined;
  isPending: boolean;
  isError: boolean;
  isFetching: boolean;
  refetch: () => unknown;
};

type EverythingProps = {
  lists: SavedList[];
  joined: JoinedList[];
  /** The lists could not be read: the spots and a new list are still there. */
  failed: boolean;
  onRetry: () => void;
  retrying: boolean;
  spots: SpotsRead;
  chips: ChipList[];
  onPick: (listId: string | undefined) => void;
  actions: PlaceActions;
  now: number;
  recentPlaces: ReactNode;
};

/** Everything the account saved, as the web's `SavedPanel` lays it out. */
function Everything({
  lists,
  joined,
  failed,
  onRetry,
  retrying,
  spots,
  chips,
  onPick,
  actions,
  now,
  recentPlaces,
}: EverythingProps) {
  const { space } = useTheme();
  const mutations = useListMutations();
  // Deleting a list takes two presses: the trash, then the button that takes its place.
  const [confirming, setConfirming] = useState<string>();
  const spotNames = new Map((spots.data?.spots ?? []).map((spot) => [spot.id, spot.name]));
  const isEmpty = lists.every((list) => sizeOf(list) === 0);

  return (
    <>
      <ListChips lists={chips} current={undefined} onPick={onPick} bleed={space.m} />
      {recentPlaces}
      <SpotsSection spots={spots} now={now} actions={actions} />

      {failed ? (
        <ErrorState plain title={m.saved_load_failed()} onRetry={onRetry} retrying={retrying} />
      ) : isEmpty ? (
        <Text tone="muted">{m.saved_empty()}</Text>
      ) : null}

      {lists.map((list) => (
        <ListSection
          key={list.id}
          list={list}
          others={othersOf(lists, list.id)}
          spotNames={spotNames}
          // A spot the list names before the account's spots are read waits; one deleted
          // meanwhile leaves no row.
          spotsKnown={!spots.isPending}
          confirming={confirming === list.id}
          onConfirm={() => setConfirming(list.id)}
          onCancel={() => setConfirming(undefined)}
          onDelete={() => {
            setConfirming(undefined);
            mutations.remove.mutate({ id: list.id });
          }}
          actions={actions}
          now={now}
        />
      ))}

      <JoinedLists lists={joined} onPick={onPick} />

      <NewListField
        creating={mutations.create.isPending}
        onCreate={(name) => mutations.create.mutateAsync({ name })}
      />
    </>
  );
}

/** The account's own spots: what adds one, that they are private, then each of them. */
function SpotsSection({
  spots,
  now,
  actions,
}: {
  spots: SpotsRead;
  now: number;
  actions: PlaceActions;
}) {
  const { colors, space } = useTheme();
  const all = spots.data?.spots;
  return (
    <View style={{ gap: space.xs }}>
      <SectionHeader
        title={m.spots_title()}
        count={all?.length}
        action={{
          label: m.spot_add(),
          icon: PinPlusIcon,
          variant: "secondary",
          onPress: () => router.push("/spot/new"),
        }}
      />
      {spots.isError ? (
        <ErrorState
          plain
          title={m.spots_load_failed()}
          onRetry={() => void spots.refetch()}
          retrying={spots.isFetching}
        />
      ) : spots.isPending ? (
        <RowsWaiting count={1} />
      ) : all && all.length > 0 ? (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.xxs }}>
            <Glyph icon={LockIcon} size={14} color={colors["neutral-7"]} />
            <Text size="s" tone="muted" style={{ flexShrink: 1 }}>
              {m.spots_private()}
            </Text>
          </View>
          <PlaceRows
            rows={all.map((spot) => ({
              key: `spot:${spot.id}`,
              item: { ref: { kind: "spot" as const, id: spot.id }, name: spot.name },
            }))}
            now={now}
            contextOf={() => ({ ownSpot: true })}
            actions={actions}
          />
        </>
      ) : (
        <Text size="s" tone="muted">
          {m.spots_empty()}
        </Text>
      )}
    </View>
  );
}

type ListSectionProps = {
  list: SavedList;
  /** The account's other lists, which a place can be moved to. */
  others: ReturnType<typeof othersOf>;
  spotNames: ReadonlyMap<string, string>;
  spotsKnown: boolean;
  /** Whether its trash was pressed: Cancel and Delete stand in its place. */
  confirming: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onDelete: () => void;
  actions: PlaceActions;
  now: number;
};

/**
 * One of the account's lists: its name and how many it holds, what shares it, in the theme's
 * accent while it is shared, and what deletes it, but the favorites; then each place, its
 * stations first, with the X that takes it out.
 */
function ListSection({
  list,
  others,
  spotNames,
  spotsKnown,
  confirming,
  onConfirm,
  onCancel,
  onDelete,
  actions,
  now,
}: ListSectionProps) {
  const { colors, space } = useTheme();
  const rows = useSavedPlaces(savedRefsOf(list), { spots: spotNames, spotsKnown });
  const name = listName(list);
  const size = sizeOf(list);
  const choice = { id: list.id, name };

  const accessory = confirming ? (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.xxs }}>
      <Button variant="ghost" onPress={onCancel}>
        {m.action_cancel()}
      </Button>
      <Button
        variant="danger"
        onPress={onDelete}
        accessibilityHint={m.saved_delete_list({ name: list.name })}
      >
        {m.action_delete()}
      </Button>
    </View>
  ) : (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.xxs }}>
      <IconButton
        icon={ShareIcon}
        size="small"
        variant="ghost"
        iconColor={list.share ? colors["color-1"] : undefined}
        selected={list.share !== null}
        label={list.share ? m.share_action_on({ name }) : m.share_action_of({ name })}
        onPress={() => shareList(list.id)}
      />
      {!list.isDefault ? (
        <IconButton
          icon={TrashIcon}
          size="small"
          variant="ghost"
          label={m.saved_delete_list({ name: list.name })}
          onPress={onConfirm}
        />
      ) : null}
    </View>
  );

  return (
    <View style={{ gap: space.xs }}>
      <SectionHeader title={name} count={size} accessory={accessory} />
      {size === 0 ? (
        <Text size="s" tone="muted">
          {m.saved_list_empty()}
        </Text>
      ) : (
        <PlaceRows
          rows={rows}
          now={now}
          contextOf={(item) => ({ list: choice, others, ownSpot: item.ref.kind === "spot" })}
          actions={actions}
          removable
        />
      )}
    </View>
  );
}

type ChosenListProps = {
  id: string;
  /**
   * Whether it is one of the account's own, which says its line before it is read: undefined
   * while the account's lists are on their way.
   */
  own: boolean | undefined;
  chips: ChipList[];
  onPick: (listId: string | undefined) => void;
  actions: PlaceActions;
  now: number;
};

/**
 * One list alone, chosen by its chip or shown alone on the map: under the tab's title, the line
 * that says so, then the web's `ListPanel`. A list deleted, let go of or shared no more gives
 * everything back, as the map does, which says so.
 */
function ChosenList({ id, own, chips, onPick, actions, now }: ChosenListProps) {
  const { space } = useTheme();
  const mutations = useListMutations();
  // The map reads the same list alone, as it asks it.
  const view = useQuery({ ...orpc.v1.lists.view.queryOptions({ input: { id } }), retry: false });
  useEffect(() => {
    if (view.isError) onPick(undefined);
  }, [view.isError, onPick]);

  const list = view.data;
  const access = list?.access ?? (own === undefined ? undefined : own ? "owner" : "member");
  // The switch moves at once, and the API's answer stands.
  const { reports } = mutations;
  const reportsOn = reports.isPending ? reports.variables.on : (list?.reportsOn ?? null);

  return (
    <>
      <View style={{ gap: space.m }}>
        {access ? (
          <Text size="s">{access === "owner" ? m.list_alone_own() : m.list_alone_shared()}</Text>
        ) : null}
        <ListChips lists={chips} current={id} onPick={onPick} bleed={space.m} />
      </View>
      {list ? (
        <ListPanel
          list={list}
          now={now}
          actions={actions}
          reports={
            reportsOn === null
              ? undefined
              : { on: reportsOn, onChange: (on) => reports.mutate({ id, on }) }
          }
          onShare={() => shareList(id)}
          onLeave={() => {
            // The map lets go of the list first: once left, it would say that it is gone.
            onPick(undefined);
            mutations.leave.mutate({ id });
          }}
          leaving={mutations.leave.isPending}
        />
      ) : (
        <RowsWaiting />
      )}
    </>
  );
}
