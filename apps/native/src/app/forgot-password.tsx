import { router, useNavigation } from "expo-router";
import { useEffect, useState } from "react";
import { AccessibilityInfo, View } from "react-native";
import { z } from "zod";

import { useVisitorWall } from "@/components/auth/login-wall";
import { emailSchema } from "@/components/auth/sign-in-words";
import { SmallLink } from "@/components/auth/small-link";
import { Button } from "@/components/ui/button";
import { FormScroll, useAppForm, useFormSend } from "@/components/ui/form";
import { feel } from "@/components/ui/haptics";
import { PanelHeader } from "@/components/ui/sheet";
import { useTell } from "@/components/ui/toast";
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
 * (`ForgotPasswordPage`) does, with its title and its grey text in the sheet's head. The screen
 * cannot say whether the address has an account: the API does not tell it. The mail is written in
 * the app's language, which every call to the library says. Decision 026.
 */
export default function ForgotPasswordScreen() {
  const { colors, space } = useTheme();
  const navigation = useNavigation();
  const walled = useVisitorWall();
  const [state, setState] = useState<State>({ step: "asking" });
  const close = () => (router.canGoBack() ? router.back() : router.replace("/"));

  // Back to the sheet that signs in, which opened this one and keeps what it was opened for, or
  // to the wall that stands in place of the tabs while the instance is closed to visitors, which
  // signs in itself; to a new sheet when neither is under it.
  const backToSignIn = () => {
    const stack = navigation.getState();
    const under = stack ? stack.routes[stack.index - 1] : undefined;
    if (under?.name === "sign-in" || (walled && under !== undefined)) router.back();
    else router.replace("/sign-in");
  };

  const form = useAskForm(setState);

  const title = state.step === "sent" ? m.reset_ask_sent_title() : m.reset_ask_title();
  const text =
    state.step === "asking"
      ? m.reset_ask_text()
      : state.step === "sent"
        ? m.reset_ask_sent({ email: state.email })
        : m.reset_ask_off();

  // What the API answered is said as it comes, as the web's page says it in a live region.
  useEffect(() => {
    if (state.step !== "asking") AccessibilityInfo.announceForAccessibility(`${title}. ${text}`);
  }, [state.step, title, text]);

  return (
    <FormScroll
      style={{ flex: 1, backgroundColor: colors["cte-canvas"] }}
      contentContainerStyle={{ paddingBottom: space.xl }}
    >
      <PanelHeader title={title} description={text} dialog onClose={close} />
      <View style={{ paddingHorizontal: space.m, paddingTop: space.l }}>
        {state.step === "asking" ? (
          <form.AppForm>
            <AskingFields form={form} onBack={backToSignIn} />
          </form.AppForm>
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.s }}>
            <Button variant="secondary" onPress={backToSignIn}>
              {m.reset_back_to_sign_in()}
            </Button>
          </View>
        )}
      </View>
    </FormScroll>
  );
}

/**
 * Asks for the link, and says what the API answered: a refusal about nothing in particular is a
 * toast, as the web's route says it.
 */
function useAskForm(onAnswer: (state: State) => void) {
  const tell = useTell();
  return useAppForm({
    defaultValues: { email: "" },
    validators: { onSubmit: z.object({ email: emailSchema() }) },
    onSubmit: async ({ value }) => {
      const email = value.email.trim();
      const answer = await authClient
        .requestPasswordReset({ email, fetchOptions: { headers: { "X-App": appHeader() } } })
        .catch(() => null);
      if (answer && !answer.error) {
        feel("done");
        onAnswer({ step: "sent", email });
        return;
      }
      if (answer?.error.code === "RESET_PASSWORD_DISABLED") {
        onAnswer({ step: "off" });
        return;
      }
      tell({
        title: answer?.error.status === 429 ? m.verify_too_many() : m.auth_failed(),
        tone: "danger",
      });
    },
  });
}

/** The address, what sends it, and the way back to signing in under them, as on the web. */
function AskingFields({
  form,
  onBack,
}: {
  form: ReturnType<typeof useAskForm>;
  onBack: () => void;
}) {
  const { space } = useTheme();
  const send = useFormSend();
  return (
    <View style={{ gap: space.m }}>
      <form.AppField name="email">
        {(field) => (
          <field.Input
            label={m.auth_email()}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="username"
            autoComplete="email"
            returnKeyType="send"
            onSubmitEditing={() => void send()}
          />
        )}
      </form.AppField>
      <form.SubmitButton fill>{m.reset_ask_send()}</form.SubmitButton>
      <View style={{ alignItems: "center" }}>
        <SmallLink muted label={m.reset_back_to_sign_in()} onPress={onBack} />
      </View>
    </View>
  );
}
