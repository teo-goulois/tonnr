import type { SavedList } from "@repo/client/viewer/types";
import { CopyIcon, LockIcon } from "@repo/ui/icon";
import * as Clipboard from "expo-clipboard";
import { Platform, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { z } from "zod";

import { Glyph } from "@/components/shared/glyph";
import { Button } from "@/components/ui/button";
import { useAppForm, useFormSend } from "@/components/ui/form";
import { feel } from "@/components/ui/haptics";
import { Field, Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { useTell } from "@/components/ui/toast";
import { ENV } from "@/env";
import { useSheetFoot } from "@/components/ui/sheet";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";

import { listName } from "./items";
import { listLinkOf } from "./links";
import type { useListMutations } from "./use-list-mutations";

// Sharing a list, the web's `ShareListDialog` in a sheet of the platform's that is as tall as what
// it holds: what its link gives, then the link to make, or the link to copy with how many accounts
// kept it, the password it may ask for, a new link and the end of it, each done at once as the
// web does. The list's private spots are said before the link is made: whoever has it sees them
// (decision 035). A password too short is said under its field, and its button is never held
// still for it (decision 076).

// A password as the API takes it.
const PASSWORD_LEAST = 4;
const PASSWORD_MOST = 72;

type ShareSheetProps = {
  list: SavedList;
  /** How many of the list's spots only their owner sees today. */
  privateSpots: number;
  mutations: ReturnType<typeof useListMutations>;
  /** Closes the sheet: its Cancel, and what stops the sharing. */
  onClose: () => void;
};

export function ShareSheet({ list, privateSpots, mutations, onClose }: ShareSheetProps) {
  const { colors, space, radius } = useTheme();
  const foot = useSheetFoot(space.l);
  const tell = useTell();
  const share = list.share;
  const busy = mutations.isSharing;
  const name = listName(list);

  const warning =
    privateSpots > 0 ? (
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          gap: space.xs,
          padding: space.s,
          borderRadius: radius.s,
          borderCurve: "continuous",
          backgroundColor: colors["warning-transparent"],
        }}
      >
        <View style={{ marginTop: 2 }}>
          <Glyph icon={LockIcon} size={14} color={colors["neutral-10"]} />
        </View>
        <Text size="s" style={{ flexShrink: 1 }}>
          {privateSpots === 1
            ? m.share_private_one()
            : m.share_private_some({ count: privateSpots })}
        </Text>
      </View>
    ) : null;

  return (
    // iOS raises its sheet over the keyboard on its own; Android's is lifted here.
    <KeyboardAvoidingView behavior="padding" enabled={Platform.OS === "android"}>
      <View
        style={{
          gap: space.l,
          padding: space.l,
          paddingBottom: foot,
        }}
      >
        <View style={{ gap: space.xs }}>
          <Text size="l" weight="medium" accessibilityRole="header">
            {m.share_title({ name })}
          </Text>
          <Text tone="muted">{m.share_what()}</Text>
        </View>

        {!share ? (
          <>
            {warning}
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                justifyContent: "flex-end",
                gap: space.xs,
              }}
            >
              <Button variant="ghost" onPress={onClose}>
                {m.action_cancel()}
              </Button>
              <Button
                loading={busy}
                onPress={() => {
                  void mutations.share.mutateAsync({ id: list.id }).then(
                    () => feel("done"),
                    // What failed was told, and the lists are read again.
                    () => {},
                  );
                }}
              >
                {m.share_create()}
              </Button>
            </View>
          </>
        ) : (
          <>
            <LinkField
              link={listLinkOf(ENV.EXPO_PUBLIC_SITE_URL, getLocale(), share.token)}
              members={share.members}
              onCopied={() => tell({ title: m.share_copied(), tone: "success" })}
              onCopyFailed={() => tell({ title: m.share_copy_failed(), tone: "danger" })}
            />

            {warning}

            {share.hasPassword ? (
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: space.xs,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
                  <Glyph icon={LockIcon} size={14} color={colors["neutral-10"]} />
                  <Text>{m.share_password_on()}</Text>
                </View>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onPress={() => {
                    void mutations.share.mutateAsync({ id: list.id, password: null }).then(
                      () => feel("done"),
                      () => {},
                    );
                  }}
                >
                  {m.share_password_remove()}
                </Button>
              </View>
            ) : (
              <PasswordField
                busy={busy}
                onAdd={(password) => mutations.share.mutateAsync({ id: list.id, password })}
              />
            )}

            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                justifyContent: "space-between",
                gap: space.xs,
              }}
            >
              <Button
                variant="ghost"
                disabled={busy}
                onPress={() => {
                  void mutations.renewShare.mutateAsync({ id: list.id }).then(
                    () => tell({ title: m.share_renewed(), tone: "success" }),
                    () => {},
                  );
                }}
              >
                {m.share_renew()}
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onPress={() => {
                  void mutations.unshare.mutateAsync({ id: list.id }).then(
                    () => tell({ title: m.share_stopped(), tone: "success" }),
                    () => {},
                  );
                  // As the web's dialog, the sheet closes as the sharing stops.
                  onClose();
                }}
              >
                {m.share_stop()}
              </Button>
            </View>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

/** The link to copy, read and selected but never typed in, and how many accounts kept the list. */
function LinkField({
  link,
  members,
  onCopied,
  onCopyFailed,
}: {
  link: string;
  members: number;
  onCopied: () => void;
  onCopyFailed: () => void;
}) {
  const { space } = useTheme();
  const copy = async () => {
    try {
      await Clipboard.setStringAsync(link);
      feel("done");
      onCopied();
    } catch {
      onCopyFailed();
    }
  };
  return (
    <View style={{ gap: space.xs }}>
      <Field label={m.share_link()}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
          <Input readOnly value={link} accessibilityLabel={m.share_link()} numberOfLines={1} />
          <Button variant="secondary" icon={CopyIcon} onPress={() => void copy()}>
            {m.share_copy()}
          </Button>
        </View>
      </Field>
      <Text size="s" tone="muted">
        {members === 0
          ? m.share_members_none()
          : members === 1
            ? m.share_members_one()
            : m.share_members_some({ count: members })}
      </Text>
    </View>
  );
}

function usePasswordForm(busy: boolean, onAdd: (password: string) => Promise<unknown>) {
  return useAppForm({
    defaultValues: { password: "" },
    validators: {
      onSubmit: z.object({
        password: z
          .string()
          .min(PASSWORD_LEAST, m.share_password_short({ least: PASSWORD_LEAST }))
          .max(PASSWORD_MOST),
      }),
    },
    onSubmit: async ({ value, formApi }) => {
      if (busy) return;
      try {
        await onAdd(value.password);
      } catch {
        // What failed was told: what was typed stays, to be sent again.
        return;
      }
      feel("done");
      formApi.reset();
    },
  });
}

function PasswordFields({
  form,
  busy,
}: {
  form: ReturnType<typeof usePasswordForm>;
  busy: boolean;
}) {
  const { space, type } = useTheme();
  const send = useFormSend();
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.xs }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <form.AppField name="password">
          {(field) => (
            <field.Input
              label={m.share_password()}
              placeholder={m.share_password_placeholder()}
              maxLength={PASSWORD_MOST}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              textContentType="none"
              returnKeyType="done"
              // The keyboard stays while a password too short is said under the field.
              submitBehavior="submit"
              onSubmitEditing={() => void send()}
              editable={!busy}
            />
          )}
        </form.AppField>
      </View>
      {/* The button stands beside the field, under its name, as the web's. */}
      <form.SubmitButton
        variant="secondary"
        pending={busy}
        style={{ marginTop: type.m.line + space.xs }}
      >
        {m.share_password_add()}
      </form.SubmitButton>
    </View>
  );
}

/**
 * The password the link will ask for, which the owner gives here, then forgets, as the web's
 * form: one too short is said under its field once sent, and the field waits while the link
 * changes, as the web's.
 */
function PasswordField({
  busy,
  onAdd,
}: {
  busy: boolean;
  onAdd: (password: string) => Promise<unknown>;
}) {
  const form = usePasswordForm(busy, onAdd);
  return (
    <form.AppForm>
      <PasswordFields form={form} busy={busy} />
    </form.AppForm>
  );
}
