import { BookmarkIcon, LockIcon, MapIcon } from "@repo/ui/icon";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { RefreshControl, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { heldBy, listName, placesCount, refsOf } from "@/components/lists/items";
import { TextField } from "@/components/lists/text-field";
import { useSharedList, useSharedReader } from "@/components/lists/use-shared-list";
import { AccountPrompt } from "@/components/saved/account-prompt";
import { type PlaceItem, usePlaceActions } from "@/components/saved/place-actions";
import { PlaceRowSkeleton } from "@/components/saved/place-row";
import { PlaceSection, SectionHeader } from "@/components/saved/place-section";
import { SEA_NOW_KEY } from "@/components/saved/use-sea-now";
import { Glyph } from "@/components/shared/glyph";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Surface } from "@/components/ui/surface";
import { Text } from "@/components/ui/text";
import { useTell } from "@/components/ui/toast";
import { useAccount } from "@/lib/account";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

/**
 * A list opened by its link, `/l/<token>` on the web (decisions 035 and 073): a visitor reads it
 * by the link, with its password when it asks one, and an account with its session, which may
 * keep it among its lists. The owner and an account that kept it read it as one of theirs, on
 * the list's own screen. Whoever reads it by the link changes nothing in it.
 */
export default function SharedListScreen() {
  const { token = "" } = useLocalSearchParams<{ token: string }>();
  const door = useSharedList(token);
  const { space } = useTheme();
  // The list is the account's, or was kept: it is read as one of its own.
  const ownId = door.list && door.list.access !== "link" ? door.list.id : undefined;
  useEffect(() => {
    if (ownId) router.replace(`/list/${ownId}`);
  }, [ownId]);

  if (door.state === "opening" || ownId) {
    return (
      <View
        accessible
        accessibilityLabel={m.native_loading()}
        style={{ flex: 1, padding: space.m, paddingTop: space.xxl }}
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
  if (door.state === "locked") {
    return (
      <PasswordDoor
        owner={door.owner}
        refusal={door.refusal}
        checking={door.isChecking}
        onPassword={door.onPassword}
      />
    );
  }
  if (door.state === "missing" || door.state === "failed" || !door.list) {
    const missing = door.state === "missing";
    return (
      <View style={{ flex: 1, justifyContent: "center", padding: space.m }}>
        <Stack.Screen options={{ title: "" }} />
        {missing ? (
          <EmptyState
            icon={BookmarkIcon}
            title={m.shared_missing_title()}
            description={m.shared_missing_text()}
            action={{ label: m.native_go_to_map(), onPress: () => router.navigate("/") }}
          />
        ) : (
          <ErrorState
            title={m.shared_failed_title()}
            description={m.shared_failed_text()}
            onRetry={() => void door.refetch()}
          />
        )}
      </View>
    );
  }
  return <SharedList token={token} door={door} list={door.list} />;
}

type Door = ReturnType<typeof useSharedList>;

function SharedList({
  token,
  door,
  list,
}: {
  token: string;
  door: Door;
  list: NonNullable<Door["list"]>;
}) {
  const { space } = useTheme();
  const tell = useTell();
  const queryClient = useQueryClient();
  const { signedIn } = useAccount();
  const reader = useSharedReader(token, door.pass, door.byLink);
  const actions = usePlaceActions();
  const [refreshing, setRefreshing] = useState(false);

  // Kept, the list is read by its id from then on, and the link is needed no more.
  const keep = useMutation(
    orpc.v1.shared.join.mutationOptions({
      onSuccess: async ({ id }) => {
        await queryClient.invalidateQueries({ queryKey: orpc.v1.lists.key() });
        tell({ title: m.list_kept_toast(), tone: "success" });
        router.replace(`/list/${id}`);
      },
      onError: (error) => tell({ title: error.message, tone: "danger" }),
    }),
  );

  const name = listName(list);
  const spotNames = new Map(list.spots.map((spot) => [spot.id, spot.name]));
  const items: PlaceItem[] = refsOf(heldBy(list)).map((ref) => ({
    ref,
    name: ref.kind === "spot" ? (spotNames.get(ref.id) ?? "") : "",
  }));

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([door.refetch(), queryClient.invalidateQueries({ queryKey: [SEA_NOW_KEY] })]);
    setRefreshing(false);
  };

  return (
    <>
      <Stack.Screen options={{ title: name, headerLargeTitle: true }} />
      <KeyboardAwareScrollView
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
        contentContainerStyle={{ padding: space.m, gap: space.l }}
      >
        {door.owner ? (
          <Text tone="muted">{m.native_shared_by({ username: door.owner })}</Text>
        ) : null}
        <PlaceSection
          // The map does not read `?shared=` yet, and leaving this screen lets go of the link:
          // nothing here shows the list alone on the map until it does.
          header={<SectionHeader title={placesCount(items.length)} />}
          items={items}
          reader={reader}
          // Nothing of it is the reader's: they open, send, and set an alert at a break.
          contextOf={() => ({ ownSpot: false })}
          actions={actions}
          empty={
            <Surface>
              <EmptyState icon={BookmarkIcon} title={m.saved_list_empty()} />
            </Surface>
          }
        />
        {signedIn ? (
          <Surface style={{ padding: space.m, gap: space.s }}>
            <Text tone="muted">{m.list_keep_text()}</Text>
            <Button
              icon={BookmarkIcon}
              loading={keep.isPending}
              onPress={() =>
                keep.mutate({
                  token,
                  ...(door.password !== undefined && { password: door.password }),
                  ...(door.pass !== null && { pass: door.pass }),
                })
              }
              style={{ alignSelf: "flex-start" }}
            >
              {m.list_keep()}
            </Button>
          </Surface>
        ) : (
          <AccountPrompt text={m.list_account_prompt()} next={`/shared/${token}`} />
        )}
      </KeyboardAwareScrollView>
      {actions.sheet}
    </>
  );
}

/** What a list that asks for a password shows before it: who shares it, and the password. */
function PasswordDoor({
  owner,
  refusal,
  checking,
  onPassword,
}: {
  owner: string | null;
  refusal: Door["refusal"];
  checking: boolean;
  onPassword: (password: string) => void;
}) {
  const { colors, space } = useTheme();
  const [password, setPassword] = useState("");
  const open = () => {
    if (password && !checking) onPassword(password);
  };

  return (
    <KeyboardAwareScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      bottomOffset={space.l}
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: "center",
        padding: space.m,
        gap: space.l,
      }}
    >
      <Stack.Screen options={{ title: "" }} />
      <View style={{ gap: space.xs }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
          <Glyph icon={LockIcon} size={18} color={colors["neutral-10"]} />
          <Text size="l" weight="medium" accessibilityRole="header" style={{ flexShrink: 1 }}>
            {m.shared_locked_title()}
          </Text>
        </View>
        {owner ? <Text tone="muted">{m.native_shared_by({ username: owner })}</Text> : null}
        <Text tone="muted">{m.shared_locked_text()}</Text>
      </View>
      <View style={{ gap: space.xs }}>
        <Surface style={{ paddingHorizontal: space.m }}>
          <TextField
            value={password}
            onChangeText={setPassword}
            placeholder={m.shared_password()}
            accessibilityLabel={m.shared_password()}
            secureTextEntry
            maxLength={72}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            autoFocus
            returnKeyType="go"
            submitBehavior="blurAndSubmit"
            onSubmitEditing={open}
            editable={!checking}
          />
        </Surface>
        {refusal ? (
          <Text
            size="s"
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={{ color: colors.error }}
          >
            {refusal === "wrong" ? m.shared_password_wrong() : m.shared_password_closed()}
          </Text>
        ) : null}
      </View>
      <Button icon={MapIcon} onPress={open} disabled={!password} loading={checking} fill>
        {m.shared_open()}
      </Button>
    </KeyboardAwareScrollView>
  );
}
