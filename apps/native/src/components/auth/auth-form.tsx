import { USERNAME_MAX } from "@repo/config/username";
import type { AnyFormApi } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { type ComponentRef, type ReactNode, type Ref, useEffect, useRef, useState } from "react";
import { type TextInput, type TextInputProps, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  LayoutAnimationConfig,
  LinearTransition,
} from "react-native-reanimated";
import { z } from "zod";

import { useOpenPage } from "@/components/account/open-page";
import { liveUsernameFault, typedUsername, usernameRefusal } from "@/components/account/username";
import { inSmallLetters, usernameSchema } from "@/components/account/username-form";
import { useUsernameFree } from "@/components/account/use-username";
import { refuseField, useAppForm, useFormSend, useSelector } from "@/components/ui/form";
import { feel } from "@/components/ui/haptics";
import { Text } from "@/components/ui/text";
import { useTell } from "@/components/ui/toast";
import { APP_ORIGIN, appHeader } from "@/lib/app-client";
import { authClient } from "@/lib/auth-client";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

import { ProviderSignIn, useOfferedProviders } from "./provider-sign-in";
import {
  type AuthMode,
  emailSchema,
  PASSWORD_MAX,
  PASSWORD_RULES,
  passwordSchema,
  refusalWords,
} from "./sign-in-words";
import { SmallLink } from "./small-link";

// How long the username's row takes to come and go, and the form under it to move: the web's
// `duration-250`, on the theme's easing.
const ROW_MS = 250;

type AuthFormProps = {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  // Runs once the person is signed in, whichever way.
  onSignedIn: () => void;
  // What the link someone gave the visitor ends with. It goes with a sign-up: the new account
  // then has the link's owner as its sponsor, and the two are friends. Decision 041.
  invitation?: string | undefined;
};

/**
 * Signs a visitor in, or creates their account, as the web's `AuthForm` does, in its words and
 * its order: the providers the instance offers, with what creating an account accepts under them
 * whichever the mode, which App Review asks of an app (guideline 1.2) and the web does not say
 * there, then the username at a sign-up, the address and the password, which the phone's
 * passwords fill and keep, the button, what a sign-up accepts or the forgotten password, and at
 * the bottom the line that switches from one to the other. It is a form of the kit (decision
 * 078): it says nothing before it is sent, then says under each field what is wrong, and what the
 * API refuses about the username under it; any other refusal is a toast. Decision 070.
 */
export function AuthForm({ mode, onModeChange, onSignedIn, invitation }: AuthFormProps) {
  const isSignUp = mode === "sign-up";
  const [providerPending, setProviderPending] = useState(false);
  const form = useAuthForm({ isSignUp, invitation, onSignedIn, providerPending });

  return (
    <form.AppForm>
      <AuthFields
        form={form}
        isSignUp={isSignUp}
        invitation={invitation}
        providerPending={providerPending}
        onProviderPending={setProviderPending}
        onModeChange={onModeChange}
        onSignedIn={onSignedIn}
      />
    </form.AppForm>
  );
}

function useAuthForm({
  isSignUp,
  invitation,
  onSignedIn,
  providerPending,
}: {
  isSignUp: boolean;
  invitation: string | undefined;
  onSignedIn: () => void;
  providerPending: boolean;
}) {
  const queryClient = useQueryClient();
  const tell = useTell();

  // Tells a new account to look for the mail that checks its address, on an instance that sends
  // one. The account is signed in either way, so a failure to ask says nothing.
  async function announceCheck(address: string) {
    const account = await queryClient
      .fetchQuery(orpc.v1.account.get.queryOptions({ staleTime: 0 }))
      .catch(() => null);
    if (account?.checksAddresses && !account.emailVerified) {
      tell({ title: m.verify_expect({ email: address }), duration: 8000 });
    }
  }

  return useAppForm({
    defaultValues: { username: "", email: "", password: "" },
    validators: {
      onSubmit: z.object({
        username: isSignUp ? usernameSchema : z.string(),
        email: emailSchema(),
        password: passwordSchema(),
      }),
    },
    onSubmit: async ({ value, formApi }) => {
      if (providerPending) return;
      const email = value.email.trim();
      const username = typedUsername(value.username);
      const fetchOptions = { headers: { "expo-origin": APP_ORIGIN, "X-App": appHeader() } };
      const answer = await (
        isSignUp
          ? // The sign-in library asks every account for a name: a new one gives its username,
            // which is what it is called by.
            authClient.signUp.email({
              email,
              password: value.password,
              name: username,
              username,
              ...(invitation !== undefined && { invitation }),
              fetchOptions,
            })
          : authClient.signIn.email({ email, password: value.password, fetchOptions })
      ).catch(() => null);
      if (!answer || answer.error) {
        const code = answer?.error.code;
        // A username the library does not take is said under its field, which then takes the
        // keyboard; a suspended account in the reader's language, and the other reasons as the
        // library words them, in a toast, as the web says them.
        const aboutUsername = isSignUp ? usernameRefusal(code) : undefined;
        if (aboutUsername) {
          refuseField(formApi, "username", aboutUsername);
          return;
        }
        tell({ title: refusalWords(code, answer?.error.message), tone: "danger" });
        return;
      }
      feel("done");
      if (isSignUp) void announceCheck(email);
      onSignedIn();
    },
  });
}

function AuthFields({
  form,
  isSignUp,
  invitation,
  providerPending,
  onProviderPending,
  onModeChange,
  onSignedIn,
}: {
  form: ReturnType<typeof useAuthForm>;
  isSignUp: boolean;
  invitation: string | undefined;
  providerPending: boolean;
  onProviderPending: (pending: boolean) => void;
  onModeChange: (mode: AuthMode) => void;
  onSignedIn: () => void;
}) {
  const { space, motion } = useTheme();
  const tell = useTell();
  const send = useFormSend();
  const isSubmitting = useSelector(form.store, (state) => state.isSubmitting);
  // Whether the providers' buttons stand over the form, with what an account accepts under them.
  const hasProviders = useOfferedProviders().length > 0;
  const emailRef = useRef<ComponentRef<typeof TextInput>>(null);
  const passwordRef = useRef<ComponentRef<typeof TextInput>>(null);
  const [x1, y1, x2, y2] = motion.easing;
  const easing = Easing.bezier(x1, y1, x2, y2);
  const moves = LinearTransition.duration(ROW_MS).easing(easing);

  return (
    // A sheet that opens on creating an account has its username at once, as the web's row is
    // drawn open: only a switch moves it.
    <LayoutAnimationConfig skipEntering>
      <Animated.View layout={moves} style={{ gap: space.m }}>
        <ProviderSignIn
          invitation={invitation}
          disabled={isSubmitting}
          onPendingChange={onProviderPending}
          onSignedIn={onSignedIn}
          onRefused={(refusal) => {
            if (refusal) tell({ title: refusal, tone: "danger" });
          }}
          // A provider creates the account of whoever it does not know yet, whichever of the two
          // the form is at: what that accepts is said under its buttons, before one is pressed.
          under={<TermsLine />}
        />

        {/* The username's row comes and goes as the web's collapses, and what stands under it
          moves with it. It moves too, with what stands under it, when the providers' buttons
          come in over it once the instance has said which it offers: it would otherwise jump
          while the address slid over it. */}
        {isSignUp ? (
          <Animated.View
            layout={moves}
            entering={FadeIn.duration(ROW_MS).easing(easing)}
            exiting={FadeOut.duration(ROW_MS).easing(easing)}
          >
            <form.AppField
              name="username"
              validators={{ onChange: liveUsernameFault }}
              listeners={{ onChange: inSmallLetters }}
            >
              {(field) => <SignUpUsername field={field} onNext={() => emailRef.current?.focus()} />}
            </form.AppField>
          </Animated.View>
        ) : null}

        <Animated.View layout={moves} style={{ gap: space.m }}>
          <form.AppField name="email">
            {(field) => (
              <field.Input
                ref={emailRef}
                label={m.auth_email()}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                // The address is what signs in: the keychain keeps it beside the password.
                textContentType="username"
                autoComplete="email"
                returnKeyType="next"
                submitBehavior="submit"
                onSubmitEditing={() => passwordRef.current?.focus()}
              />
            )}
          </form.AppField>
          <form.AppField name="password">
            {(field) => (
              <field.Input
                ref={passwordRef}
                label={m.auth_password()}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                textContentType={isSignUp ? "newPassword" : "password"}
                autoComplete={isSignUp ? "new-password" : "current-password"}
                passwordRules={isSignUp ? PASSWORD_RULES : undefined}
                maxLength={PASSWORD_MAX}
                returnKeyType="go"
                onSubmitEditing={() => void send()}
              />
            )}
          </form.AppField>

          <form.SubmitButton fill disabled={providerPending}>
            {isSignUp ? m.auth_create_account() : m.auth_sign_in()}
          </form.SubmitButton>

          {/* A sign-up says what it accepts, once: under the providers' buttons where they stand
            over the form, since they make an account too, and here otherwise. A sign-in offers a
            new password in this place. */}
          {isSignUp ? (
            hasProviders ? null : (
              <TermsLine />
            )
          ) : (
            <View style={{ alignItems: "center" }}>
              <SmallLink
                muted
                label={m.auth_forgot_password()}
                onPress={() => router.push("/forgot-password")}
              />
            </View>
          )}

          {/* The other of the two, as the web says it under its form. */}
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              justifyContent: "center",
              alignItems: "center",
              columnGap: space.xxs,
            }}
          >
            <Text size="s" tone="muted">
              {isSignUp ? m.auth_have_account() : m.auth_no_account()}
            </Text>
            <SmallLink
              role="button"
              label={isSignUp ? m.auth_sign_in() : m.auth_create_account()}
              onPress={() => onModeChange(isSignUp ? "sign-in" : "sign-up")}
            />
          </View>
        </Animated.View>
      </Animated.View>
    </LayoutAnimationConfig>
  );
}

/**
 * What creating an account accepts, as the web's sign-up says it: one sentence in the muted
 * small type that ends on the two texts, underlined in it, which open in the browser the system
 * draws over the app.
 */
function TermsLine() {
  const { openPage } = useOpenPage();
  return (
    <Text size="s" tone="muted" style={{ textAlign: "center" }}>
      {m.auth_accept_terms()}{" "}
      <Text
        size="s"
        tone="muted"
        accessibilityRole="link"
        onPress={() => void openPage("terms")}
        style={{ textDecorationLine: "underline" }}
      >
        {m.terms_title()}
      </Text>
      {", "}
      <Text
        size="s"
        tone="muted"
        accessibilityRole="link"
        onPress={() => void openPage("privacy")}
        style={{ textDecorationLine: "underline" }}
      >
        {m.privacy_title()}
      </Text>
    </Text>
  );
}

/** The field of a form's `AppField`: its value, its form, its name and the kit's input. */
type UsernameField = {
  state: { value: string };
  form: AnyFormApi;
  name: string;
  Input: (
    props: Omit<TextInputProps, "value" | "onChangeText"> & {
      label?: string;
      description?: string;
      ref?: Ref<ComponentRef<typeof TextInput>>;
    },
  ) => ReactNode;
};

/**
 * The username a sign-up asks for, as the web's `UsernameInput` in its form: it says whether the
 * name is free once typing has stopped, and that it is taken under the field, as a refusal of the
 * API would, so that an account is not made to learn it by failing. Its key goes on to the
 * address, where the account's own form sends.
 */
function SignUpUsername({ field, onNext }: { field: UsernameField; onNext: () => void }) {
  const isFree = useUsernameFree(typedUsername(field.state.value));
  const { form, name } = field;
  useEffect(() => {
    if (isFree === false) refuseField(form, name, m.username_taken());
  }, [form, name, isFree]);

  return (
    <field.Input
      label={m.auth_username()}
      description={isFree ? m.username_free() : m.username_hint()}
      autoCapitalize="none"
      autoCorrect={false}
      spellCheck={false}
      // The name others read is no part of what the keychain keeps: the address is.
      textContentType="nickname"
      autoComplete="off"
      maxLength={USERNAME_MAX}
      returnKeyType="next"
      submitBehavior="submit"
      onSubmitEditing={onNext}
    />
  );
}
