import type { SavedItem } from "@repo/client/viewer/types";
import { ArrowLeftIcon, CheckIcon, CirclePlusIcon, ListsIcon } from "@repo/ui/icon";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { BackHandler, Platform, Pressable, ScrollView, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Glyph } from "@/components/shared/glyph";
import { Button, IconButton } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { feel } from "@/components/ui/haptics";
import { Row, Section } from "@/components/ui/list";
import { TARGET } from "@/components/ui/metrics";
import { Loading, Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

import { choicesOf } from "./lists";
import { TextField } from "./text-field";
import { useLists } from "./use-lists";

// What the bookmark of a place opens: the account's lists, the favorites first, each with the
// platform's check while it holds the place, which a press changes at once; then a new list, named in
// a second step of the same sheet rather than in a sheet over it, and the way to the lists
// themselves. The web's `StationActions` on a phone. Decision 017.

// A list's name, as long as the API takes it.
const NAME_MOST = 60;

/** The head of a step of the sheet: its title, and what goes back or closes. */
export function StepHeader({
  title,
  onBack,
  onClose,
}: {
  title: string;
  onBack?: () => void;
  onClose?: () => void;
}) {
  const { space } = useTheme();
  return (
    <View
      style={{
        minHeight: 48,
        flexDirection: "row",
        alignItems: "center",
        gap: space.xs,
        // Room over it for the grabber that the platform draws at the top of the sheet.
        paddingTop: space.s,
        paddingHorizontal: space.m,
      }}
    >
      {onBack && (
        <IconButton icon={ArrowLeftIcon} label={m.action_back()} variant="ghost" onPress={onBack} />
      )}
      <Text weight="medium" accessibilityRole="header" numberOfLines={2} style={{ flex: 1 }}>
        {title}
      </Text>
      {onClose && (
        <Button variant="ghost" onPress={onClose}>
          {m.action_close()}
        </Button>
      )}
    </View>
  );
}

/** A list of the sheet: its name, and a check while it holds the place. */
function ListRow({
  title,
  checked,
  onPress,
}: {
  title: string;
  checked: boolean;
  onPress: () => void;
}) {
  const { colors, space } = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={title}
      accessibilityState={{ checked }}
      onPress={() => {
        feel("select");
        onPress();
      }}
      style={({ pressed }) => ({
        minHeight: TARGET,
        flexDirection: "row",
        alignItems: "center",
        gap: space.s,
        paddingHorizontal: space.m,
        paddingVertical: space.xs,
        backgroundColor: pressed ? colors["neutral-3"] : undefined,
      })}
    >
      <Text style={{ flex: 1 }}>{title}</Text>
      <View style={{ width: 20, alignItems: "center" }}>
        {checked && <Glyph icon={CheckIcon} size={18} color={colors["color-1"]} />}
      </View>
    </Pressable>
  );
}

export function SaveToLists({ item, name }: { item: SavedItem; name: string }) {
  const { space } = useTheme();
  const insets = useSafeAreaInsets();
  const { lists, save, createWith, isCreating } = useLists();
  const [isNaming, setIsNaming] = useState(false);
  const [listName, setListName] = useState("");
  const named = listName.trim();
  // Android's back goes from the second step to the first, as the button over it does.
  useEffect(() => {
    if (!isNaming) return;
    const listener = BackHandler.addEventListener("hardwareBackPress", () => {
      setIsNaming(false);
      return true;
    });
    return () => listener.remove();
  }, [isNaming]);

  const create = () => {
    if (!named || isCreating) return;
    createWith(named, item, () => {
      setListName("");
      setIsNaming(false);
    });
  };

  if (isNaming) {
    return (
      <KeyboardAvoidingView behavior="padding" enabled={Platform.OS === "android"}>
        <StepHeader title={m.saved_new_list()} onBack={() => setIsNaming(false)} />
        <View
          style={{
            gap: space.m,
            paddingHorizontal: space.m,
            paddingTop: space.s,
            paddingBottom: insets.bottom + space.m,
          }}
        >
          <Text size="s" tone="muted">
            {m.saved_new_list_text()}
          </Text>
          <TextField
            label={m.saved_list_name()}
            value={listName}
            onChangeText={setListName}
            maxLength={NAME_MOST}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={create}
          />
          <Button fill onPress={create} disabled={!named} loading={isCreating}>
            {m.saved_create_list()}
          </Button>
        </View>
      </KeyboardAvoidingView>
    );
  }

  const choices = lists.data ? choicesOf(lists.data, item, m.saved_favorites()) : undefined;

  return (
    <View>
      <StepHeader title={m.saved_add_to_list()} onClose={() => router.back()} />
      <Text size="s" tone="muted" numberOfLines={1} style={{ paddingHorizontal: space.m }}>
        {name}
      </Text>
      <ScrollView
        contentContainerStyle={{
          gap: space.l,
          padding: space.m,
          paddingBottom: insets.bottom + space.m,
        }}
      >
        {lists.isError ? (
          <ErrorState
            title={m.saved_load_failed()}
            onRetry={() => void lists.refetch()}
            retrying={lists.isRefetching}
          />
        ) : !choices ? (
          <Loading>
            <View style={{ gap: space.xs }}>
              <Skeleton height={44} />
              <Skeleton height={44} />
            </View>
          </Loading>
        ) : (
          <Section>
            {choices.map((choice) => (
              <ListRow
                key={choice.id}
                title={choice.name}
                checked={choice.checked}
                onPress={() => save(choice.id, item, !choice.checked)}
              />
            ))}
          </Section>
        )}
        <Section>
          <Row
            title={m.saved_new_list_here()}
            icon={CirclePlusIcon}
            chevron={false}
            disabled={!choices}
            onPress={() => setIsNaming(true)}
          />
          <Row
            title={m.saved_manage_lists()}
            icon={ListsIcon}
            onPress={() => {
              router.dismissAll();
              router.navigate("/saved");
            }}
          />
        </Section>
      </ScrollView>
    </View>
  );
}
