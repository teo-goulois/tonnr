import { ArrowLeftIcon, CheckIcon, PlusIcon } from "@repo/ui/icon";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { BackHandler, Platform, Pressable, ScrollView, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";

import { Field } from "@/components/auth/field";
import { NAME_MOST } from "@/components/lists/new-list-field";
import type { PlaceRef } from "@/components/saved/sea-now";
import { Glyph, type GlyphIcon } from "@/components/shared/glyph";
import { Button, IconButton } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { feel } from "@/components/ui/haptics";
import { TARGET } from "@/components/ui/metrics";
import { Loading, Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Text } from "@/components/ui/text";
import { SheetRoot, useSheetFoot } from "@/components/ui/sheet";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

import { choicesOf } from "./lists";
import { useLists } from "./use-lists";

// What the bookmark of a place opens: the account's lists, the favorites first, each with a check
// before it while it holds the place, which a press changes at once; then a new list, named in a
// second step of the same sheet rather than in a sheet over it, and the way to the lists
// themselves. Plain rows under a line, as the web's `StationActions` draws them in its sheet on a
// phone. Decision 017.

// The column a check stands in before a list's name, the web's `1rem`, and the size of what is
// drawn there, its `size-4.5`.
const MARK_COLUMN = 16;
const MARK = 18;

/**
 * The head of a step of the sheet: its title, and what goes back or closes. A title alone stands
 * in the middle, as the web's sheet sets it on a phone.
 */
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
  const alone = !onBack && !onClose;
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
      <Text
        weight="medium"
        accessibilityRole="header"
        numberOfLines={2}
        style={{ flex: 1, textAlign: alone ? "center" : undefined }}
      >
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

/** A row of the sheet's menu: what is drawn before its words, in their column, and its words. */
function MenuRow({
  title,
  mark,
  onPress,
  disabled = false,
  checked,
}: {
  title: string;
  mark?: GlyphIcon;
  onPress: () => void;
  disabled?: boolean;
  /** For a list, whether it holds the place: a check is drawn before it while it does. */
  checked?: boolean;
}) {
  const { colors, space } = useTheme();
  return (
    <Pressable
      accessibilityRole={checked === undefined ? "button" : "checkbox"}
      accessibilityLabel={title}
      accessibilityState={checked === undefined ? { disabled } : { checked, disabled }}
      disabled={disabled}
      onPress={() => {
        feel("select");
        onPress();
      }}
      style={({ pressed }) => ({
        minHeight: TARGET,
        flexDirection: "row",
        alignItems: "center",
        gap: space.xs,
        paddingHorizontal: space.m,
        paddingVertical: space.xxs,
        backgroundColor: pressed ? colors["neutral-3"] : undefined,
        opacity: disabled ? 0.64 : 1,
      })}
    >
      <View style={{ width: MARK_COLUMN, alignItems: "center", opacity: 0.8 }}>
        {mark && (checked ?? true) ? (
          <Glyph icon={mark} size={MARK} color={colors["neutral-10"]} />
        ) : null}
      </View>
      <Text style={{ flex: 1 }}>{title}</Text>
    </Pressable>
  );
}

export function SaveToLists({ place }: { place: PlaceRef }) {
  const { colors, space } = useTheme();
  const foot = useSheetFoot(space.m);
  const { lists, save, createWith, isCreating } = useLists();
  const [isNaming, setIsNaming] = useState(false);
  const [listName, setListName] = useState("");
  const [missing, setMissing] = useState(false);
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

  // The button is never grey: a name left empty is said under its field, as the web says it.
  const create = () => {
    if (isCreating) return;
    if (!named) {
      setMissing(true);
      return;
    }
    createWith(named, place, () => {
      setListName("");
      setIsNaming(false);
    });
  };

  if (isNaming) {
    return (
      <KeyboardAvoidingView
        behavior="padding"
        enabled={Platform.OS === "android"}
        style={{ backgroundColor: colors["cte-canvas"] }}
      >
        <StepHeader title={m.saved_new_list()} onBack={() => setIsNaming(false)} />
        <View
          style={{
            gap: space.l,
            paddingHorizontal: space.m,
            paddingTop: space.s,
            paddingBottom: foot,
          }}
        >
          <Field
            label={m.saved_list_name()}
            value={listName}
            onChangeText={(next) => {
              setListName(next);
              if (next.trim()) setMissing(false);
            }}
            error={missing ? m.saved_list_name_missing() : undefined}
            maxLength={NAME_MOST}
            disabled={isCreating}
            autoFocus
            autoCapitalize="sentences"
            returnKeyType="done"
            submitBehavior="blurAndSubmit"
            onSubmitEditing={create}
          />
          <Button fill onPress={create} loading={isCreating}>
            {m.saved_create_list()}
          </Button>
        </View>
      </KeyboardAvoidingView>
    );
  }

  const choices = lists.data ? choicesOf(lists.data, place) : undefined;

  return (
    // The lists' scroll view stands under the header: SheetRoot keeps react-native-screens from
    // moving it over it. The sheet's ground is the theme's, as the web's sheet is, under rows
    // that stand on it with no card.
    <SheetRoot className="bg-background">
      <StepHeader title={m.saved_add_to_list()} />
      <ScrollView
        contentContainerStyle={{
          paddingTop: space.s,
          paddingBottom: foot,
        }}
      >
        {lists.isError ? (
          <View style={{ paddingHorizontal: space.m }}>
            <ErrorState
              title={m.saved_load_failed()}
              onRetry={() => void lists.refetch()}
              retrying={lists.isRefetching}
            />
          </View>
        ) : !choices ? (
          <Loading>
            <View style={{ gap: space.xs, paddingHorizontal: space.m }}>
              <Skeleton height={TARGET} />
              <Skeleton height={TARGET} />
            </View>
          </Loading>
        ) : (
          choices.map((choice) => (
            <MenuRow
              key={choice.id}
              title={choice.name}
              mark={CheckIcon}
              checked={choice.checked}
              onPress={() => save(choice.id, place, !choice.checked)}
            />
          ))
        )}
        <View style={{ paddingHorizontal: space.m, paddingVertical: space.xxs }}>
          <Separator />
        </View>
        <MenuRow
          title={m.saved_new_list_here()}
          mark={PlusIcon}
          disabled={!choices}
          onPress={() => setIsNaming(true)}
        />
        <MenuRow
          title={m.saved_manage_lists()}
          onPress={() => {
            router.dismissAll();
            router.navigate("/saved");
          }}
        />
      </ScrollView>
    </SheetRoot>
  );
}
