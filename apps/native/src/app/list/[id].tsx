import { BellIcon, BookmarkIcon, LogOutIcon, TrashIcon } from "@repo/ui/icon";
import type { ListView, SavedList } from "@repo/client/viewer/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { RefreshControl, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import {
  codeOf,
  heldBy,
  listName,
  othersOf,
  placesCount,
  refsOf,
  retryUnlessGone,
  sizeOf,
} from "@/components/lists/items";
import { ListNameField } from "@/components/lists/list-name-field";
import { ShareSection } from "@/components/lists/share-section";
import { useListMutations } from "@/components/lists/use-list-mutations";
import { AccountPrompt } from "@/components/saved/account-prompt";
import { confirmDestructive } from "@/components/saved/confirm";
import { type PlaceItem, showListOnMap, usePlaceActions } from "@/components/saved/place-actions";
import { PlaceRowSkeleton } from "@/components/saved/place-row";
import { PlaceSection, SectionHeader } from "@/components/saved/place-section";
import { SEA_NOW_KEY, useAccountReader } from "@/components/saved/use-sea-now";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Row, Section } from "@/components/ui/list";
import { Surface } from "@/components/ui/surface";
import { useTell } from "@/components/ui/toast";
import { useAccount } from "@/lib/account";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

/**
 * A list of the account's, or one of someone else's that it kept, read alone (decisions 017 and
 * 035): what it holds, each place with the sea now, and what its reader may do with it. Its owner
 * renames it, shares it by its link, says whether the reports at its breaks are told (decision
 * 068), and deletes it, asked first. An account that kept it lets go of it. Both show it alone on
 * the map.
 */
export default function ListScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { signedIn, pending } = useAccount();
  const { space } = useTheme();

  if (pending) return <Waiting />;
  if (!signedIn) {
    return (
      <View style={{ flex: 1, padding: space.m }}>
        <Stack.Screen options={{ title: m.saved_title() }} />
        <AccountPrompt text={m.saved_sign_in_prompt()} next={`/list/${id}`} />
      </View>
    );
  }
  return <ListOfTheAccount id={id} />;
}

function ListOfTheAccount({ id }: { id: string }) {
  const { space } = useTheme();
  const tell = useTell();
  const queryClient = useQueryClient();
  const reader = useAccountReader();
  const actions = usePlaceActions();
  const mutations = useListMutations();
  const view = useQuery({
    ...orpc.v1.lists.view.queryOptions({ input: { id } }),
    retry: retryUnlessGone,
  });
  const lists = useQuery(orpc.v1.lists.list.queryOptions());
  // The list as it was shown when it was deleted or let go of: it stays while the screen goes
  // back, in place of the list that is no more.
  const [leftWith, setLeftWith] = useState<{ view: ListView; own: SavedList | undefined }>();
  const list = view.data ?? leftWith?.view;
  const owner = list?.access === "owner";
  const spots = useQuery({ ...orpc.v1.spots.list.queryOptions(), enabled: owner });
  const [refreshing, setRefreshing] = useState(false);

  if (!list && view.isPending) return <Waiting />;
  if (!list) {
    if (codeOf(view.error) === "NOT_FOUND") {
      return (
        <View style={{ flex: 1, justifyContent: "center" }}>
          <Stack.Screen options={{ title: "" }} />
          <EmptyState
            icon={BookmarkIcon}
            title={m.native_list_missing()}
            action={{ label: m.action_back(), onPress: goBack }}
          />
        </View>
      );
    }
    return (
      <View style={{ flex: 1, justifyContent: "center" }}>
        <Stack.Screen options={{ title: "" }} />
        <ErrorState
          title={m.saved_load_failed()}
          onRetry={() => void view.refetch()}
          retrying={view.isFetching}
        />
      </View>
    );
  }

  // The account's own list as the lists last read hold it, which a change answers at once.
  const own = owner
    ? (lists.data?.lists.find((one) => one.id === list.id) ?? leftWith?.own)
    : undefined;
  const held = own ?? heldBy(list);
  const name = listName(list);
  const spotNames = new Map(list.spots.map((spot) => [spot.id, spot.name]));
  const items: PlaceItem[] = refsOf(held).map((ref) => ({
    ref,
    name: ref.kind === "spot" ? (spotNames.get(ref.id) ?? "") : "",
  }));
  const size = items.length;
  const choice = { id: list.id, name };
  const others = othersOf(lists.data?.lists ?? [], list.id);
  const nothingSaved = lists.data?.lists.every((one) => sizeOf(one) === 0) ?? false;
  const privateSpots = held.spotIds.filter(
    (spotId) =>
      spots.data?.spots.find((spot) => spot.id === spotId)?.publication?.status !== "accepted",
  ).length;
  // Whether the reports at its breaks are told to the reader, its owner or an account that
  // kept it, each by its own switch: the switch moves at once, and the API's answer stands.
  const { reports } = mutations;
  const reportsOn = reports.isPending ? reports.variables.on : list.reportsOn;

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([
      view.refetch(),
      lists.refetch(),
      owner ? spots.refetch() : undefined,
      queryClient.invalidateQueries({ queryKey: [SEA_NOW_KEY] }),
    ]);
    setRefreshing(false);
  };

  const deleteList = async () => {
    const sure = await confirmDestructive({
      title: m.saved_delete_list({ name }),
      message: m.native_list_delete_text(),
      confirm: m.action_delete(),
    });
    if (!sure) return;
    setLeftWith({ view: list, own });
    try {
      await mutations.remove.mutateAsync({ id: list.id });
    } catch {
      setLeftWith(undefined);
      return;
    }
    tell({ title: m.native_list_deleted(), tone: "success" });
    goBack();
  };

  const leaveList = async () => {
    const sure = await confirmDestructive({ title: m.list_leave(), confirm: m.list_leave() });
    if (!sure) return;
    setLeftWith({ view: list, own });
    try {
      await mutations.leave.mutateAsync({ id: list.id });
    } catch {
      setLeftWith(undefined);
      return;
    }
    goBack();
  };

  return (
    <>
      <Stack.Screen options={{ title: name, headerLargeTitle: true }} />
      <KeyboardAwareScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        bottomOffset={space.m}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
        contentContainerStyle={{ padding: space.m, gap: space.l }}
      >
        <PlaceSection
          header={
            <SectionHeader
              title={placesCount(size)}
              action={
                size > 0
                  ? { label: m.native_show_on_map(), onPress: () => showListOnMap(list.id) }
                  : undefined
              }
            />
          }
          items={items}
          reader={reader}
          contextOf={(item) =>
            owner ? { list: choice, others, ownSpot: item.ref.kind === "spot" } : { ownSpot: false }
          }
          actions={actions}
          empty={
            <Surface>
              <EmptyState
                icon={BookmarkIcon}
                title={m.saved_list_empty()}
                // How to save something, once nothing is saved in any of the account's lists.
                description={owner && nothingSaved ? m.saved_empty() : undefined}
              />
            </Surface>
          }
        />

        {owner && !list.isDefault ? (
          <ListNameField
            key={list.name}
            name={list.name}
            saving={mutations.rename.isPending}
            onRename={(renamed) =>
              mutations.rename
                .mutateAsync({ id: list.id, name: renamed })
                .then(() =>
                  tell({ title: m.native_list_renamed({ name: renamed }), tone: "success" }),
                )
            }
          />
        ) : null}

        {own ? <ShareSection list={own} privateSpots={privateSpots} mutations={mutations} /> : null}

        {reportsOn !== null ? (
          <Section>
            <Row
              icon={BellIcon}
              title={m.list_reports()}
              description={m.list_reports_hint()}
              toggle={{
                value: reportsOn,
                onChange: (on) => reports.mutate({ id: list.id, on }),
              }}
            />
          </Section>
        ) : null}

        {owner && !list.isDefault ? (
          <Section>
            <Row
              icon={TrashIcon}
              title={m.saved_delete_list({ name })}
              destructive
              chevron={false}
              disabled={mutations.remove.isPending}
              onPress={() => void deleteList()}
            />
          </Section>
        ) : null}

        {list.access === "member" ? (
          <Section footer={m.list_kept()}>
            <Row
              icon={LogOutIcon}
              title={m.list_leave()}
              destructive
              chevron={false}
              disabled={mutations.leave.isPending}
              onPress={() => void leaveList()}
            />
          </Section>
        ) : null}
      </KeyboardAwareScrollView>
      {actions.sheet}
    </>
  );
}

/** Back where the list was opened from, or to the saved tab for a list a link opened first. */
function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace("/saved");
}

/** What a list's screen shows while it is read: the place of its rows. */
function Waiting() {
  const { space } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={m.native_loading()}
      style={{ flex: 1, padding: space.m, paddingTop: space.xxl, gap: space.xs }}
    >
      <Stack.Screen options={{ title: "" }} />
      <Surface style={{ overflow: "hidden" }}>
        <PlaceRowSkeleton />
        <PlaceRowSkeleton />
        <PlaceRowSkeleton />
      </Surface>
    </View>
  );
}
