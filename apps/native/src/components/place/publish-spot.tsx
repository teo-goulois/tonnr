import { Platform, ScrollView, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { z } from "zod";

import { useOpenPage } from "@/components/account/open-page";
import { AccountPrompt } from "@/components/auth/account-prompt";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { useAppForm, useSelector } from "@/components/ui/form";
import { TEXTAREA_LEAST } from "@/components/ui/input";
import { PanelHeader, useSheetFoot, useSheetGuard } from "@/components/ui/sheet";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useAccount } from "@/lib/account";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

import { usePlaceRecord } from "./use-place";
import { useSpotActions } from "./use-spot";

// Asking that a spot of the account's own be made public, with a word for the moderator, in a
// sheet that the spot's menu opens, as the web's `SpotActions` asks it in a dialog: its title and
// what a moderator checks, what follows once it is accepted, the word, the licence the spot then
// takes, and Cancel beside what sends it. The word starts empty, as the web's. The web keeps it
// while its dialog is closed; a sheet that is left forgets it, so the guard asks before a word
// written is lost (decision 078). Decision 034.

// The word for the moderator, as long as the API takes it.
const NOTE_MOST = 280;

export function PublishSpot({ id }: { id: string }) {
  const { colors, space, type } = useTheme();
  const foot = useSheetFoot(space.m);
  const { openPage } = useOpenPage();
  const { signedIn, pending } = useAccount();
  const record = usePlaceRecord("spot", id);
  const spot = record.isOwner ? record.spot : undefined;
  const actions = useSpotActions();
  const form = useAppForm({
    defaultValues: { note: "" },
    validators: { onSubmit: z.object({ note: z.string().max(NOTE_MOST) }) },
    onSubmit: ({ value }) => {
      if (!spot || actions.isPublishing) return;
      actions.publish(spot, value.note.trim(), guard.close);
    },
  });
  const written = useSelector(form.store, (state) => state.values.note.trim() !== "");
  const guard = useSheetGuard(written && !actions.isPublishing);

  // The sheet's ground is the theme's down to its foot, under parts that stand on it with no card.
  const ground = { backgroundColor: colors["cte-canvas"] };
  const room = { paddingHorizontal: space.m, paddingBottom: foot };

  if (!spot) {
    const waiting = record.isPending || pending;
    return (
      <View style={ground}>
        {waiting ? (
          // The head, whose title alone needs the spot, and the place of the form's first parts,
          // what follows once it is accepted and the word's field, while the spot is read. The
          // title says "Loading" to a screen reader, once, and the shapes under it nothing.
          <>
            <PanelHeader
              title={null}
              description={m.spot_publish_what()}
              dialog
              onClose={guard.cancel}
            />
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={[room, { gap: space.l, paddingTop: space.l }]}
            >
              <SkeletonText lines={2} size="s" />
              <View style={{ gap: space.xs }}>
                <Skeleton height={type.m.size} width="60%" />
                <Skeleton height={TEXTAREA_LEAST} />
              </View>
            </View>
          </>
        ) : (
          <View style={[room, { paddingTop: space.l }]}>
            {signedIn ? (
              <ErrorState plain title={m.spot_not_found()} />
            ) : (
              <AccountPrompt text={m.spot_sign_in_prompt()} />
            )}
          </View>
        )}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior="padding" enabled={Platform.OS === "android"} style={ground}>
      <form.AppForm>
        <PanelHeader
          title={m.spot_publish_title({ name: spot.name })}
          description={m.spot_publish_what()}
          dialog
          onClose={guard.cancel}
        />
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[room, { gap: space.l, paddingTop: space.l }]}
        >
          <Text size="s" tone="muted">
            {m.spot_publish_then()}
          </Text>
          <form.AppField name="note">
            {(field) => (
              <field.Textarea
                label={m.spot_publish_note()}
                placeholder={m.spot_publish_note_placeholder()}
                maxLength={NOTE_MOST}
                editable={!actions.isPublishing}
              />
            )}
          </form.AppField>
          <Text size="s" tone="muted">
            {m.spot_publish_license()}{" "}
            <Text
              size="s"
              tone="muted"
              accessibilityRole="link"
              onPress={() => void openPage("terms")}
              style={{ textDecorationLine: "underline" }}
            >
              {m.terms_title()}
            </Text>
          </Text>
          {/* The web's dialog ends on its two buttons at their own width, the one that sends last. */}
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              justifyContent: "flex-end",
              gap: space.xs,
            }}
          >
            <Button variant="ghost" onPress={guard.cancel}>
              {m.action_cancel()}
            </Button>
            <form.SubmitButton pending={actions.isPublishing}>
              {m.spot_publish_send()}
            </form.SubmitButton>
          </View>
        </ScrollView>
      </form.AppForm>
    </KeyboardAvoidingView>
  );
}
