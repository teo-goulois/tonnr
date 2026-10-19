import { useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { forgetOnPhone } from "@/components/account/leave";
import { Field } from "@/components/auth/field";
import { PASSWORD_MAX, passwordFault } from "@/components/auth/sign-in-words";
import { Button } from "@/components/ui/button";
import { feel } from "@/components/ui/haptics";
import { SheetHeader } from "@/components/ui/sheet";
import { Text } from "@/components/ui/text";
import { useTell } from "@/components/ui/toast";
import { appHeader } from "@/lib/app-client";
import { authClient } from "@/lib/auth-client";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

/**
 * Where the link of the mail for a new password opens the app (decision 073): the account
 * chooses one, and every session of it closes, this phone's too, so the screen then asks to sign
 * in with it. The link signs no one in. Decisions 026 and 070.
 */
export default function ResetPasswordScreen() {
  const { colors, space } = useTheme();
  const queryClient = useQueryClient();
  const tell = useTell();
  const { token: given } = useLocalSearchParams<{ token?: string }>();
  const token = typeof given === "string" && given.length > 0 ? given : undefined;
  const [spent, setSpent] = useState(false);
  const [password, setPassword] = useState("");
  const [wasSent, setWasSent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refusal, setRefusal] = useState<string>();
  const close = () => (router.canGoBack() ? router.back() : router.replace("/"));

  async function reset() {
    setWasSent(true);
    setRefusal(undefined);
    if (!token || passwordFault(password) || saving) return;
    setSaving(true);
    const answer = await authClient
      .resetPassword({
        newPassword: password,
        token,
        fetchOptions: { headers: { "X-App": appHeader() } },
      })
      .catch(() => null);
    setSaving(false);
    if (answer && !answer.error) {
      feel("done");
      tell({ title: m.reset_done(), tone: "success" });
      // Every session of the account ended: whatever this phone kept of one goes with it.
      await authClient.signOut().catch(() => null);
      forgetOnPhone(queryClient);
      router.replace("/sign-in");
      return;
    }
    const code = answer?.error.code;
    if (code === "INVALID_TOKEN" || code === "USER_NOT_FOUND") return setSpent(true);
    feel("failed");
    setRefusal(code === "PASSWORD_TOO_SHORT" ? m.auth_password_too_short() : m.auth_failed());
  }

  const isValid = token !== undefined && !spent;

  return (
    <KeyboardAwareScrollView
      style={{ flex: 1, backgroundColor: colors["cte-canvas"] }}
      contentContainerStyle={{ paddingBottom: space.xl }}
      keyboardShouldPersistTaps="handled"
      bottomOffset={space.l}
    >
      <SheetHeader title={isValid ? m.reset_title() : m.reset_title_invalid()} onCancel={close} />
      <View style={{ gap: space.l, paddingHorizontal: space.m, paddingTop: space.xs }}>
        {isValid ? (
          <>
            <Field
              label={m.reset_new_password()}
              value={password}
              onChangeText={setPassword}
              autoFocus
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="newPassword"
              autoComplete="new-password"
              passwordRules="minlength: 8; maxlength: 128;"
              maxLength={PASSWORD_MAX}
              returnKeyType="done"
              onSubmitEditing={() => void reset()}
              disabled={saving}
              error={wasSent ? passwordFault(password) : undefined}
              hint={m.reset_signs_out()}
            />
            {refusal ? (
              <Text tone="danger" size="s" accessibilityRole="alert">
                {refusal}
              </Text>
            ) : null}
            <Button fill loading={saving} onPress={() => void reset()}>
              {m.reset_save()}
            </Button>
          </>
        ) : (
          <>
            <Text accessibilityLiveRegion="polite">{m.reset_invalid()}</Text>
            <Button fill onPress={() => router.replace("/forgot-password")}>
              {m.reset_ask_again()}
            </Button>
          </>
        )}
      </View>
    </KeyboardAwareScrollView>
  );
}
