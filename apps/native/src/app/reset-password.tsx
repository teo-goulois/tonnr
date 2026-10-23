import { useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, View } from "react-native";
import { z } from "zod";

import { forgetOnPhone } from "@/components/account/leave";
import { PASSWORD_MAX, PASSWORD_RULES, passwordSchema } from "@/components/auth/sign-in-words";
import { Button } from "@/components/ui/button";
import { FormScroll, refuseField, useAppForm, useFormSend } from "@/components/ui/form";
import { PanelHeader } from "@/components/ui/sheet";
import { useTell } from "@/components/ui/toast";
import { appHeader } from "@/lib/app-client";
import { authClient } from "@/lib/auth-client";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

/**
 * Where the link of the mail for a new password opens the app (decision 073), as the web's page
 * (`ResetPasswordPage`) does, with its title in the sheet's head: the account chooses one, and
 * every session of it closes, this phone's too, so the screen then asks to sign in with it. A
 * link that works no more says so, and asks for another. The link signs no one in. Decisions 026
 * and 070.
 */
export default function ResetPasswordScreen() {
  const { colors, space } = useTheme();
  const { token: given } = useLocalSearchParams<{ token?: string }>();
  const token = typeof given === "string" && given.length > 0 ? given : undefined;
  const [spent, setSpent] = useState(false);
  const form = useResetForm(token, () => setSpent(true));
  const close = () => (router.canGoBack() ? router.back() : router.replace("/"));
  const isValid = token !== undefined && !spent;

  // A link the API said works no more is said as it comes, as the web's page says it in a live
  // region; one that carried no token says it as the sheet opens, by its head.
  const wasSpent = useRef(spent);
  useEffect(() => {
    if (spent && !wasSpent.current) {
      AccessibilityInfo.announceForAccessibility(
        `${m.reset_title_invalid()}. ${m.reset_invalid()}`,
      );
    }
    wasSpent.current = spent;
  }, [spent]);

  return (
    <FormScroll
      style={{ flex: 1, backgroundColor: colors["cte-canvas"] }}
      contentContainerStyle={{ paddingBottom: space.xl }}
    >
      <PanelHeader
        title={isValid ? m.reset_title() : m.reset_title_invalid()}
        description={isValid ? undefined : m.reset_invalid()}
        dialog
        onClose={close}
      />
      <View style={{ paddingHorizontal: space.m, paddingTop: space.l }}>
        {isValid ? (
          <form.AppForm>
            <NewPasswordFields form={form} />
          </form.AppForm>
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.s }}>
            <Button onPress={() => router.replace("/forgot-password")}>
              {m.reset_ask_again()}
            </Button>
          </View>
        )}
      </View>
    </FormScroll>
  );
}

/**
 * Sets the new password, then forgets on the phone the session the API closed and opens the sheet
 * that signs in. A password the API finds too short is said under the field, the other refusals
 * in a toast, as the web's route says them; a link that works no more is `onSpent`.
 */
function useResetForm(token: string | undefined, onSpent: () => void) {
  const queryClient = useQueryClient();
  const tell = useTell();
  return useAppForm({
    defaultValues: { password: "" },
    validators: { onSubmit: z.object({ password: passwordSchema() }) },
    onSubmit: async ({ value, formApi }) => {
      if (!token) return;
      const answer = await authClient
        .resetPassword({
          newPassword: value.password,
          token,
          fetchOptions: { headers: { "X-App": appHeader() } },
        })
        .catch(() => null);
      if (answer && !answer.error) {
        tell({ title: m.reset_done(), tone: "success" });
        // Every session of the account ended: whatever this phone kept of one goes with it.
        await authClient.signOut().catch(() => null);
        forgetOnPhone(queryClient);
        router.replace("/sign-in");
        return;
      }
      const code = answer?.error.code;
      if (code === "INVALID_TOKEN" || code === "USER_NOT_FOUND") {
        onSpent();
        return;
      }
      if (code === "PASSWORD_TOO_SHORT") {
        refuseField(formApi, "password", m.auth_password_too_short());
        return;
      }
      tell({ title: m.auth_failed(), tone: "danger" });
    },
  });
}

/** The new password, with what choosing one does under it, and what sets it. */
function NewPasswordFields({ form }: { form: ReturnType<typeof useResetForm> }) {
  const { space } = useTheme();
  const send = useFormSend();
  return (
    <View style={{ gap: space.m }}>
      <form.AppField name="password">
        {(field) => (
          <field.Input
            label={m.reset_new_password()}
            description={m.reset_signs_out()}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="newPassword"
            autoComplete="new-password"
            passwordRules={PASSWORD_RULES}
            maxLength={PASSWORD_MAX}
            returnKeyType="done"
            onSubmitEditing={() => void send()}
          />
        )}
      </form.AppField>
      <form.SubmitButton fill>{m.reset_save()}</form.SubmitButton>
    </View>
  );
}
