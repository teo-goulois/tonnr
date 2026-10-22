import { LockIcon } from "@repo/ui/icon";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { type ComponentRef, useEffect, useRef, useState } from "react";
import { Pressable, RefreshControl, ScrollView, type TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { listName } from "@/components/lists/items";
import { useListInView } from "@/components/lists/list-in-view";
import { ListPanel } from "@/components/lists/list-panel";
import { holdLink } from "@/components/lists/shared-link";
import { useSharedList } from "@/components/lists/use-shared-list";
import { openOnMap, usePlaceActions } from "@/components/saved/place-actions";
import { RowsWaiting } from "@/components/saved/place-section";
import { Glyph } from "@/components/shared/glyph";
import { Button } from "@/components/ui/button";
import { feel } from "@/components/ui/haptics";
import { Field, Input } from "@/components/ui/input";
import { TARGET } from "@/components/ui/metrics";
import { Text } from "@/components/ui/text";
import { useTell } from "@/components/ui/toast";
import { useAccount } from "@/lib/account";
import { useTheme } from "@/lib/theme";
import { useNow } from "@/lib/use-now";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

/**
 * A list opened by its link, `/l/<token>` on the web (decisions 035 and 073), in the saved tab,
 * whose bar stays under it: its name for a title, the line that says it was shared, then the
 * web's `ListPanel`. A visitor reads it by the link, with its password when it asks one, and an
 * account with its session, which may keep it among its lists, then reads it there. Its owner,
 * or an account that kept it, reads it as one of its own, alone on the map, as the web's phone
 * shows it. Whoever reads it by the link changes nothing in it.
 */
export default function SharedListScreen() {
  const { token = "" } = useLocalSearchParams<{ token: string }>();
  const door = useSharedList(token);
  const { space } = useTheme();
  // The list is the account's, or was kept: it is read as one of its own, on the map.
  const ownId = door.list && door.list.access !== "link" ? door.list.id : undefined;
  useEffect(() => {
    if (!ownId) return;
    backToSaved();
    router.navigate({ pathname: "/", params: { list: ownId } });
  }, [ownId]);

  if (door.state === "opening" || ownId) {
    return (
      <View style={{ flex: 1, padding: space.m }}>
        <Stack.Screen options={{ title: "" }} />
        <RowsWaiting heading />
      </View>
    );
  }
  if (door.state === "locked") {
    return (
      <PasswordDoor
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
        <View style={{ alignItems: "flex-start", gap: space.m }}>
          <View style={{ gap: space.xs }}>
            <Text size="l" weight="medium" accessibilityRole="header">
              {missing ? m.shared_missing_title() : m.shared_failed_title()}
            </Text>
            <Text tone="muted">{missing ? m.shared_missing_text() : m.shared_failed_text()}</Text>
          </View>
          {missing ? (
            <MapLink />
          ) : (
            <Button
              variant="secondary"
              onPress={() => void door.refetch()}
              loading={door.isFetching}
            >
              {m.action_retry()}
            </Button>
          )}
        </View>
      </View>
    );
  }
  return <SharedList token={token} door={door} list={door.list} />;
}

/** Back to the saved tab's first screen, which a link puts under this one. */
function backToSaved() {
  if (router.canGoBack()) router.back();
  else router.replace("/saved");
}

/** The app's home is the map: where a link that opens no list leads, as the web's leads home. */
function MapLink() {
  const slop = Math.ceil(TARGET / 4);
  return (
    <Pressable
      accessibilityRole="link"
      hitSlop={slop}
      onPress={() => {
        backToSaved();
        router.navigate("/");
      }}
    >
      {({ pressed }) => (
        <Text
          style={{
            textDecorationLine: "underline",
            opacity: pressed ? 0.6 : 1,
          }}
        >
          {m.native_go_to_map()}
        </Text>
      )}
    </Pressable>
  );
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
  const { colors, space } = useTheme();
  const tell = useTell();
  const queryClient = useQueryClient();
  const { signedIn } = useAccount();
  const now = useNow();
  const { show } = useListInView();
  // A place opens on the map, where the link is still held while this screen stays.
  const actions = usePlaceActions({ open: (place) => openOnMap(place, undefined) });
  const [refreshing, setRefreshing] = useState(false);

  // Kept, the list is read by its id from then on, alone in the saved tab and on the map.
  const keep = useMutation(
    orpc.v1.shared.join.mutationOptions({
      onSuccess: async ({ id }) => {
        await queryClient.invalidateQueries({ queryKey: orpc.v1.lists.key() });
        tell({ title: m.list_kept_toast(), tone: "success" });
        show(id);
        backToSaved();
      },
      onError: (error) => tell({ title: error.message, tone: "danger" }),
    }),
  );

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([
      door.refetch(),
      queryClient.invalidateQueries({ queryKey: orpc.v1.stations.get.key() }),
      queryClient.invalidateQueries({ queryKey: orpc.v1.breaks.get.key() }),
    ]);
    setRefreshing(false);
  };

  return (
    <>
      <Stack.Screen options={{ title: listName(list), headerLargeTitle: true }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refresh()}
            tintColor={colors["neutral-7"]}
            colors={[colors["neutral-7"]]}
          />
        }
        contentContainerStyle={{ padding: space.m, gap: space.m }}
      >
        <Text size="s">{m.list_alone_shared()}</Text>
        <ListPanel
          list={list}
          now={now}
          actions={actions}
          keep={{
            signedIn,
            keeping: keep.isPending,
            next: `/saved/shared/${token}`,
            onKeep: () =>
              keep.mutate({
                token,
                ...(door.password !== undefined && { password: door.password }),
                ...(door.pass !== null && { pass: door.pass }),
              }),
          }}
          // A visitor reads each place by the link, whatever the screen holds by then.
          hold={door.byLink ? () => holdLink(token, door.pass) : undefined}
        />
      </ScrollView>
      {actions.sheet}
    </>
  );
}

/**
 * What a list that asks for a password shows before it, as the web's `SharedDoor`: that it asks
 * one, the field, and what opens the list. An empty field, a wrong password and too many of them
 * are said under the field, which takes the keyboard back with the API's answer.
 */
function PasswordDoor({
  refusal,
  checking,
  onPassword,
}: {
  refusal: Door["refusal"];
  checking: boolean;
  onPassword: (password: string) => void;
}) {
  const { colors, space } = useTheme();
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const [password, setPassword] = useState("");
  const [missing, setMissing] = useState(false);
  // How many times a password was given: the API's answer to each is said under the field, even
  // when it is the same as the last, until something else is typed.
  const [tries, setTries] = useState(0);
  const [typedSince, setTypedSince] = useState(false);
  const refused = tries > 0 && !checking && refusal !== undefined && !typedSince;

  useEffect(() => {
    if (tries > 0 && !checking && refusal) input.current?.focus();
  }, [tries, checking, refusal]);

  const open = () => {
    if (checking) return;
    if (!password) {
      feel("failed");
      setMissing(true);
      return;
    }
    setTypedSince(false);
    setTries((count) => count + 1);
    onPassword(password);
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
        gap: space.m,
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
        <Text tone="muted">{m.shared_locked_text()}</Text>
      </View>
      <Field
        label={m.shared_password()}
        error={
          missing
            ? m.shared_password_missing()
            : refused
              ? refusal === "wrong"
                ? m.shared_password_wrong()
                : m.shared_password_closed()
              : undefined
        }
      >
        <Input
          ref={input}
          value={password}
          onChangeText={(typed) => {
            setPassword(typed);
            setMissing(false);
            setTypedSince(true);
          }}
          accessibilityLabel={m.shared_password()}
          invalid={missing || refused}
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
      </Field>
      <Button onPress={open} loading={checking} fill>
        {m.shared_open()}
      </Button>
    </KeyboardAwareScrollView>
  );
}
