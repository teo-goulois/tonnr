import type { JoinedList, SavedList } from "@repo/client/viewer/types";
import { LockIcon, MapIcon } from "@repo/ui/icon";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, router } from "expo-router";
import { type ReactNode, useState } from "react";
import { RefreshControl, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import {
  chipsOf,
  heldBy,
  listName,
  othersOf,
  refsOf,
  retryUnlessGone,
  sizeOf,
} from "@/components/lists/items";
import { ListChips } from "@/components/lists/list-chips";
import { NewListField } from "@/components/lists/new-list-field";
import { useListMutations } from "@/components/lists/use-list-mutations";
import { AccountPrompt } from "@/components/saved/account-prompt";
import type { RowContext } from "@/components/saved/actions";
import {
  type PlaceActions,
  type PlaceItem,
  showListOnMap,
  usePlaceActions,
} from "@/components/saved/place-actions";
import { PlaceRowSkeleton } from "@/components/saved/place-row";
import { PlaceSection, SectionHeader } from "@/components/saved/place-section";
import { RecentPlaces } from "@/components/saved/recent-places";
import { SEA_NOW_KEY, type SeaReader, useAccountReader } from "@/components/saved/use-sea-now";
import { Glyph } from "@/components/shared/glyph";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Row, Section } from "@/components/ui/list";
import { Surface } from "@/components/ui/surface";
import { Text } from "@/components/ui/text";
import { useAccount } from "@/lib/account";
import { useRecentPlaces } from "@/lib/recents";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

// How many places a list shows in the tab, with a row that opens the rest on its own screen.
const ROWS_IN_TAB = 5;

/**
 * What is saved, the web's `SavedPanel` as a phone's tab (decisions 017, 040 and 042): the chips
 * of the lists, a chip showing that list's places alone with what shows it on the map; what was
 * looked at last; the account's own spots; then each list, the favorites first, and those of
 * others that it kept. Each place has the sea now beside it, and a list opens on its own screen.
 * Pulled down, everything is read again. A visitor is asked for an account, and keeps what they
 * looked at.
 */
export default function SavedScreen() {
  const { signedIn, pending } = useAccount();
  const { space } = useTheme();
  const queryClient = useQueryClient();
  const reader = useAccountReader();
  const actions = usePlaceActions();
  const recents = useRecentPlaces();
  const [refreshing, setRefreshing] = useState(false);

  const lists = useQuery({ ...orpc.v1.lists.list.queryOptions(), enabled: signedIn });
  const spots = useQuery({ ...orpc.v1.spots.list.queryOptions(), enabled: signedIn });

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([
      signedIn ? lists.refetch() : undefined,
      signedIn ? spots.refetch() : undefined,
      recents.refresh(),
      queryClient.invalidateQueries({ queryKey: [SEA_NOW_KEY] }),
    ]);
    setRefreshing(false);
  };

  const recentPlaces = (
    <RecentPlaces
      recents={recents.recents}
      reader={reader}
      actions={actions}
      onClear={recents.onClear}
      bleed={space.m}
    />
  );

  return (
    <>
      <Stack.Screen options={{ title: m.saved_title() }} />
      <KeyboardAwareScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        bottomOffset={space.m}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
        contentContainerStyle={{ padding: space.m, gap: space.l }}
      >
        {pending ? (
          <RowsWaiting />
        ) : !signedIn ? (
          <>
            <AccountPrompt text={m.saved_sign_in_prompt()} next="/saved" />
            {recentPlaces}
          </>
        ) : lists.isPending ? (
          <RowsWaiting />
        ) : lists.isError ? (
          <>
            <ErrorState
              title={m.saved_load_failed()}
              onRetry={() => void lists.refetch()}
              retrying={lists.isFetching}
            />
            {recentPlaces}
          </>
        ) : (
          <Saved
            lists={lists.data.lists}
            joined={lists.data.joined}
            spots={spots}
            reader={reader}
            actions={actions}
            recentPlaces={recentPlaces}
          />
        )}
      </KeyboardAwareScrollView>
      {actions.sheet}
    </>
  );
}

/** The account's own spots, as the tab reads them. */
type SpotsRead = {
  data: { spots: { id: string; name: string }[] } | undefined;
  isPending: boolean;
  isError: boolean;
  isFetching: boolean;
  refetch: () => unknown;
};

type SavedProps = {
  lists: SavedList[];
  joined: JoinedList[];
  spots: SpotsRead;
  reader: SeaReader;
  actions: PlaceActions;
  recentPlaces: ReactNode;
};

/** What an account saved: everything, or one list alone once its chip is chosen. */
function Saved({ lists, joined, spots, reader, actions, recentPlaces }: SavedProps) {
  const { space } = useTheme();
  const mutations = useListMutations();
  const [current, setCurrent] = useState<string>();
  const chips = chipsOf(lists, joined);
  // A list chosen and then deleted, or let go of, leaves everything in view again.
  const chosen = chips.find((chip) => chip.id === current);
  const chosenList = chosen?.shared ? undefined : lists.find((list) => list.id === chosen?.id);
  const spotNames = new Map((spots.data?.spots ?? []).map((spot) => [spot.id, spot.name]));

  const itemsOf = (list: SavedList): PlaceItem[] =>
    refsOf(list).map((ref) => ({
      ref,
      name: ref.kind === "spot" ? (spotNames.get(ref.id) ?? "") : "",
    }));
  const contextOf =
    (list: SavedList) =>
    (item: PlaceItem): RowContext => ({
      list: { id: list.id, name: listName(list) },
      others: othersOf(lists, list.id),
      ownSpot: item.ref.kind === "spot",
    });
  const isEmpty = lists.every((list) => sizeOf(list) === 0);

  return (
    <>
      <ListChips lists={chips} current={chosen?.id} onPick={setCurrent} bleed={space.m} />
      {chosen ? (
        chosenList ? (
          <OneList
            list={chosenList}
            items={itemsOf(chosenList)}
            reader={reader}
            actions={actions}
            contextOf={contextOf(chosenList)}
          />
        ) : (
          <KeptList id={chosen.id} reader={reader} actions={actions} />
        )
      ) : (
        <>
          {recentPlaces}
          <PlaceSection
            header={
              <SectionHeader
                title={m.spots_title()}
                count={spots.data?.spots.length}
                action={{ label: m.spot_add(), onPress: () => router.push("/spot/new") }}
              />
            }
            items={(spots.data?.spots ?? []).map((spot) => ({
              ref: { kind: "spot" as const, id: spot.id },
              name: spot.name,
            }))}
            reader={reader}
            contextOf={() => ({ ownSpot: true })}
            actions={actions}
            footer={spots.data && spots.data.spots.length > 0 ? <PrivateLine /> : null}
            empty={
              spots.isPending ? (
                <RowsWaiting count={1} />
              ) : spots.isError ? (
                <ErrorState
                  title={m.spots_load_failed()}
                  onRetry={() => void spots.refetch()}
                  retrying={spots.isFetching}
                />
              ) : (
                <Surface style={{ padding: space.m }}>
                  <Text size="s" tone="muted">
                    {m.spots_empty()}
                  </Text>
                </Surface>
              )
            }
          />

          {isEmpty ? (
            <Surface style={{ padding: space.m }}>
              <Text tone="muted">{m.saved_empty()}</Text>
            </Surface>
          ) : null}

          {lists.map((list) => (
            <PlaceSection
              key={list.id}
              header={
                <SectionHeader
                  title={listName(list)}
                  count={sizeOf(list)}
                  onPress={() => router.push(`/list/${list.id}`)}
                  accessibilityHint={m.native_list_settings()}
                />
              }
              items={itemsOf(list)}
              reader={reader}
              contextOf={contextOf(list)}
              actions={actions}
              limit={ROWS_IN_TAB}
              onSeeAll={() => router.push(`/list/${list.id}`)}
              empty={
                <Surface style={{ padding: space.m }}>
                  <Text size="s" tone="muted">
                    {m.saved_list_empty()}
                  </Text>
                </Surface>
              }
            />
          ))}

          {joined.length > 0 ? (
            <Section title={m.lists_joined()}>
              {joined.map((list) => (
                <Row
                  key={list.id}
                  icon={MapIcon}
                  title={listName(list)}
                  value={String(list.size)}
                  accessibilityHint={m.native_list_settings()}
                  onPress={() => router.push(`/list/${list.id}`)}
                />
              ))}
            </Section>
          ) : null}

          <NewListField
            creating={mutations.create.isPending}
            onCreate={(name) => mutations.create.mutateAsync({ name })}
          />
        </>
      )}
    </>
  );
}

/** One of the account's lists, chosen by its chip: all it holds, and what shows it on the map. */
function OneList({
  list,
  items,
  reader,
  actions,
  contextOf,
}: {
  list: SavedList;
  items: PlaceItem[];
  reader: SeaReader;
  actions: PlaceActions;
  contextOf: (item: PlaceItem) => RowContext;
}) {
  const { space } = useTheme();
  return (
    <View style={{ gap: space.m }}>
      <PlaceSection
        header={
          <SectionHeader
            title={listName(list)}
            count={sizeOf(list)}
            onPress={() => router.push(`/list/${list.id}`)}
            accessibilityHint={m.native_list_settings()}
          />
        }
        items={items}
        reader={reader}
        contextOf={contextOf}
        actions={actions}
        empty={
          <Surface style={{ padding: space.m }}>
            <Text size="s" tone="muted">
              {m.saved_list_empty()}
            </Text>
          </Surface>
        }
      />
      {items.length > 0 ? <ShowOnMap listId={list.id} /> : null}
    </View>
  );
}

/** A list of someone else's that the account kept, chosen by its chip: read by its id. */
function KeptList({
  id,
  reader,
  actions,
}: {
  id: string;
  reader: SeaReader;
  actions: PlaceActions;
}) {
  const { space } = useTheme();
  const view = useQuery({
    ...orpc.v1.lists.view.queryOptions({ input: { id } }),
    retry: retryUnlessGone,
  });
  if (view.isPending) return <RowsWaiting />;
  if (view.isError) {
    return (
      <ErrorState
        title={m.list_gone()}
        onRetry={() => void view.refetch()}
        retrying={view.isFetching}
      />
    );
  }
  const list = view.data;
  const spotNames = new Map(list.spots.map((spot) => [spot.id, spot.name]));
  const items = refsOf(heldBy(list)).map((ref) => ({
    ref,
    name: ref.kind === "spot" ? (spotNames.get(ref.id) ?? "") : "",
  }));
  return (
    <View style={{ gap: space.m }}>
      <PlaceSection
        header={
          <SectionHeader
            title={listName(list)}
            count={items.length}
            onPress={() => router.push(`/list/${list.id}`)}
            accessibilityHint={m.native_list_settings()}
          />
        }
        items={items}
        reader={reader}
        contextOf={() => ({ ownSpot: false })}
        actions={actions}
        empty={
          <Surface style={{ padding: space.m }}>
            <Text size="s" tone="muted">
              {m.saved_list_empty()}
            </Text>
          </Surface>
        }
      />
      {items.length > 0 ? <ShowOnMap listId={list.id} /> : null}
    </View>
  );
}

function ShowOnMap({ listId }: { listId: string }) {
  return (
    <Button variant="secondary" icon={MapIcon} fill onPress={() => showListOnMap(listId)}>
      {m.native_show_on_map()}
    </Button>
  );
}

/** That the account's spots are its own, under them. */
function PrivateLine() {
  const { colors, space } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: space.xxs,
        paddingHorizontal: space.xxs,
      }}
    >
      <Glyph icon={LockIcon} size={14} color={colors["neutral-7"]} />
      <Text size="s" tone="muted" style={{ flexShrink: 1 }}>
        {m.spots_private()}
      </Text>
    </View>
  );
}

/** The place of rows while they are read, never a spinner. */
function RowsWaiting({ count = 3 }: { count?: number }) {
  return (
    <Surface accessible accessibilityLabel={m.native_loading()} style={{ overflow: "hidden" }}>
      {Array.from({ length: count }, (_, index) => (
        <PlaceRowSkeleton key={index} />
      ))}
    </Surface>
  );
}
