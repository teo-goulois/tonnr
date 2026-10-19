import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { Field } from "@/components/auth/field";
import { emailFault } from "@/components/auth/sign-in-words";
import { Button } from "@/components/ui/button";
import { feel } from "@/components/ui/haptics";
import { SheetHeader } from "@/components/ui/sheet";
import { Text } from "@/components/ui/text";
import { appHeader } from "@/lib/app-client";
import { authClient } from "@/lib/auth-client";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

// Where the page stands: asking for an address, the API answered for the one it was given,
// which it does the same whether the address has an account or not, or the instance sends no
// mail and is off.
type State = { step: "asking" } | { step: "sent"; email: string } | { step: "off" };

/**
 * Where an account that forgot its password asks for a link to choose another, as the web's page
 * does. The screen cannot say whether the address has an account: the API does not tell it. The
 * mail is written in the app's language, which every call to the library says. Decision 026.
 */
export default function ForgotPasswordScreen() {
  const { colors, space } = useTheme();
  const [state, setState] = useState<State>({ step: "asking" });
  const [email, setEmail] = useState("");
  const [wasSent, setWasSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [refusal, setRefusal] = useState<string>();
  const close = () => (router.canGoBack() ? router.back() : router.replace("/"));

  async function ask() {
    setWasSent(true);
    setRefusal(undefined);
    const address = email.trim();
    if (emailFault(address) || sending) return;
    setSending(true);
    const answer = await authClient
      .requestPasswordReset({ email: address, fetchOptions: { headers: { "X-App": appHeader() } } })
      .catch(() => null);
    setSending(false);
    if (answer && !answer.error) {
      feel("done");
      return setState({ step: "sent", email: address });
    }
    if (answer?.error.code === "RESET_PASSWORD_DISABLED") return setState({ step: "off" });
    feel("failed");
    setRefusal(answer?.error.status === 429 ? m.verify_too_many() : m.auth_failed());
  }

  return (
    <KeyboardAwareScrollView
      style={{ flex: 1, backgroundColor: colors["cte-canvas"] }}
      contentContainerStyle={{ paddingBottom: space.xl }}
      keyboardShouldPersistTaps="handled"
      bottomOffset={space.l}
    >
      <SheetHeader
        title={state.step === "sent" ? m.reset_ask_sent_title() : m.reset_ask_title()}
        onCancel={close}
      />
      <View style={{ gap: space.l, paddingHorizontal: space.m, paddingTop: space.xs }}>
        {state.step === "asking" ? (
          <>
            <Text tone="muted">{m.reset_ask_text()}</Text>
            <Field
              label={m.auth_email()}
              value={email}
              onChangeText={setEmail}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="username"
              autoComplete="email"
              returnKeyType="send"
              onSubmitEditing={() => void ask()}
              disabled={sending}
              error={wasSent ? emailFault(email) : undefined}
            />
            {refusal ? (
              <Text tone="danger" size="s" accessibilityRole="alert">
                {refusal}
              </Text>
            ) : null}
            <Button fill loading={sending} onPress={() => void ask()}>
              {m.reset_ask_send()}
            </Button>
          </>
        ) : (
          <>
            <Text accessibilityLiveRegion="polite">
              {state.step === "sent" ? m.reset_ask_sent({ email: state.email }) : m.reset_ask_off()}
            </Text>
            <Button variant="secondary" fill onPress={close}>
              {m.reset_back_to_sign_in()}
            </Button>
          </>
        )}
      </View>
    </KeyboardAwareScrollView>
  );
}
