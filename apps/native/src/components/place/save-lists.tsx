import { ArrowLeftIcon, CheckIcon, PlusIcon } from "@repo/ui/icon";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { BackHandler, Platform, Pressable, ScrollView, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { z } from "zod";

import { AccountPrompt } from "@/components/auth/account-prompt";
import { NAME_MOST } from "@/components/lists/new-list-field";
import type { PlaceRef } from "@/components/saved/sea-now";
import { Glyph, type GlyphIcon } from "@/components/shared/glyph";
import { IconButton } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { useAppForm, useFormSend, useSelector } from "@/components/ui/form";
import { feel } from "@/components/ui/haptics";
import { TARGET } from "@/components/ui/metrics";
import { Separator } from "@/components/ui/separator";
import { SheetRoot, useSheetFoot, useSheetGuard } from "@/components/ui/sheet";
import { Loading, Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useAccount } from "@/lib/account";
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
 * The head of a step of the lists' sheet, as the web's `DrawerHeader` sets it on a phone: the
 * title alone in the middle, with no button to close it, since the grabber and a swipe do; or,
 * on the second step, after the arrow that goes back to the first.
 */
function ListsHead({ title, onBack }: { title: string; onBack?: () => void }) {
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
      {onBack ? (
        <IconButton icon={ArrowLeftIcon} label={m.action_back()} variant="ghost" onPress={onBack} />
      ) : null}
      <Text
        weight="medium"
        accessibilityRole="header"
        numberOfLines={2}
        style={{ flex: 1, textAlign: onBack ? undefined : "center" }}
      >
        {title}
      </Text>
    </View>
  );
}

/**
 * A row of the sheet's menu, as the web's `DrawerMenuItem` on a phone: its words, after the
 * column of what is drawn before them when there is something, a press drawing its ground in the
 * theme's third grey with round ends, a step inside the sheet's edges.
 */
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
  const { colors, radius, space } = useTheme();
  // The way to the lists has no mark, and its words start where the row does, as on the web.
  const marked = mark !== undefined || checked !== undefined;
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
        // The web's menu reaches the theme's small step into its panel's room, and its rows hold
        // their words that step inside them, where the sheet's other parts start.
        marginHorizontal: space.m - space.xs,
        paddingHorizontal: space.xs,
        paddingVertical: space.xxs,
        borderRadius: radius.xs,
        borderCurve: "continuous",
        backgroundColor: pressed ? colors["neutral-3"] : undefined,
        opacity: disabled ? 0.64 : 1,
      })}
    >
      {marked ? (
        <View style={{ width: MARK_COLUMN, alignItems: "center", opacity: 0.8 }}>
          {mark && (checked ?? true) ? (
            <Glyph icon={mark} size={MARK} color={colors["neutral-10"]} />
          ) : null}
        </View>
      ) : null}
      <Text style={{ flex: 1 }}>{title}</Text>
    </Pressable>
  );
}

/** What a list's name must be, as the web's `listNameSchema` says it. */
const listNameSchema = () => z.string().trim().min(1, m.saved_list_name_missing()).max(NAME_MOST);

function useListNameForm(onCreate: (name: string) => Promise<void>) {
  return useAppForm({
    defaultValues: { name: "" },
    validators: { onSubmit: z.object({ name: listNameSchema() }) },
    onSubmit: ({ value }) => onCreate(value.name.trim()),
  });
}

/**
 * The field of the new list's name and what makes it, which the keyboard's own key does too, but
 * not a second time while the list is made: the button waits then, as the web's, whose key does
 * nothing while its button waits.
 */
function ListNameFields({ form }: { form: ReturnType<typeof useListNameForm> }) {
  const formSend = useFormSend();
  const send = () => {
    if (!form.state.isSubmitting) void formSend();
  };
  return (
    <>
      <form.AppField name="name">
        {(field) => (
          <field.Input
            label={m.saved_list_name()}
            maxLength={NAME_MOST}
            autoFocus
            autoCapitalize="sentences"
            returnKeyType="done"
            // The keyboard stays while a name left empty is said under the field.
            submitBehavior="submit"
            onSubmitEditing={send}
          />
        )}
      </form.AppField>
      <form.SubmitButton fill>{m.saved_create_list()}</form.SubmitButton>
    </>
  );
}

/**
 * The second step of the sheet, the web's `ListNameForm` in its drawer: the name of a new list,
 * which is made with the place in it, and the button that makes it at the sheet's width. A name
 * left empty is said under its field once sent, which keeps the keyboard, and goes as it changes;
 * the field stays as it is while the list is made, and keeps what was typed when the API refuses
 * it. The guard asks before a name typed and not sent is lost to a swipe (decision 078); the arrow
 * goes back without asking, as the web's does.
 */
function NewListStep({
  onBack,
  onCreate,
}: {
  onBack: () => void;
  onCreate: (name: string) => Promise<void>;
}) {
  const { colors, space } = useTheme();
  const foot = useSheetFoot(space.m);
  const form = useListNameForm(onCreate);
  // A name on its way to the API is not lost by a swipe: the list is made all the same.
  const named = useSelector(
    form.store,
    (state) => state.values.name.trim() !== "" && !state.isSubmitting,
  );
  useSheetGuard(named);
  return (
    <KeyboardAvoidingView
      behavior="padding"
      enabled={Platform.OS === "android"}
      style={{ backgroundColor: colors["cte-canvas"] }}
    >
      <ListsHead title={m.saved_new_list()} onBack={onBack} />
      <View
        style={{
          gap: space.l,
          padding: space.m,
          paddingBottom: foot,
        }}
      >
        <form.AppForm>
          <ListNameFields form={form} />
        </form.AppForm>
      </View>
    </KeyboardAvoidingView>
  );
}

export function SaveToLists({ place }: { place: PlaceRef }) {
  const { space, type } = useTheme();
  const foot = useSheetFoot(space.m);
  const { signedIn, pending } = useAccount();
  const { lists, save, createWith } = useLists();
  const [isNaming, setIsNaming] = useState(false);
  // Android's back goes from the second step to the first, as the button over it does.
  useEffect(() => {
    if (!isNaming) return;
    const listener = BackHandler.addEventListener("hardwareBackPress", () => {
      setIsNaming(false);
      return true;
    });
    return () => listener.remove();
  }, [isNaming]);

  if (isNaming) {
    return (
      <NewListStep
        onBack={() => setIsNaming(false)}
        // Once made, the sheet goes back to the lists, the new one checked. What refused it was
        // told, and the name stays to be sent again.
        onCreate={(name) =>
          createWith(name, place).then(
            () => setIsNaming(false),
            () => {},
          )
        }
      />
    );
  }

  const choices = lists.data ? choicesOf(lists.data, place) : undefined;
  const visitor = !signedIn && !pending;

  return (
    // The lists' scroll view stands under the header: SheetRoot keeps react-native-screens from
    // moving it over it. The sheet's ground is the theme's, as the web's sheet is, under rows
    // that stand on it with no card.
    <SheetRoot className="bg-background">
      <ListsHead title={m.saved_add_to_list()} />
      <ScrollView
        contentContainerStyle={{
          paddingTop: space.s,
          paddingBottom: foot,
        }}
      >
        {visitor ? (
          // Only an address reaches it signed out: the bookmark asks a visitor for an account.
          <View style={{ paddingHorizontal: space.m }}>
            <AccountPrompt text={m.saved_sign_in_prompt()} />
          </View>
        ) : (
          <>
            {/* Lists in hand stay, though reading them again failed: the web keeps them too. */}
            {!choices && lists.isError ? (
              <View style={{ paddingHorizontal: space.m }}>
                <ErrorState
                  plain
                  title={m.saved_load_failed()}
                  onRetry={() => void lists.refetch()}
                  retrying={lists.isRefetching}
                />
              </View>
            ) : !choices ? (
              // Two rows to come, a list's name after the check's column.
              <Loading>
                {[0, 1].map((row) => (
                  <View
                    key={row}
                    style={{
                      minHeight: TARGET,
                      justifyContent: "center",
                      paddingLeft: space.m + MARK_COLUMN + space.xs,
                      paddingRight: space.m,
                    }}
                  >
                    <Skeleton height={type.m.size} width="50%" />
                  </View>
                ))}
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
          </>
        )}
      </ScrollView>
    </SheetRoot>
  );
}
