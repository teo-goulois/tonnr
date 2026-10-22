import { USERNAME_MAX } from "@repo/config/username";
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useRef, useState } from "react";
import { Pressable, type TextInputInstance, View } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";

import { useOpenPage } from "@/components/account/open-page";
import { typedUsername, usernameFault, usernameSays } from "@/components/account/username";
import { useUsernameFree } from "@/components/account/use-username";
import { Button } from "@/components/ui/button";
import { feel } from "@/components/ui/haptics";
import { TARGET } from "@/components/ui/metrics";
import { Text } from "@/components/ui/text";
import { useTell } from "@/components/ui/toast";
import { APP_ORIGIN, appHeader } from "@/lib/app-client";
import { authClient } from "@/lib/auth-client";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

import { Field } from "./field";
import { ProviderSignIn } from "./provider-sign-in";
import {
  type AuthMode,
  emailFault,
  PASSWORD_MAX,
  passwordFault,
  refusalWords,
} from "./sign-in-words";

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
 * A link in small text, a finger's height, which opens what it names, or a button drawn as one,
 * as the web's switch between signing in and creating an account is.
 */
export function SmallLink({
  label,
  onPress,
  role = "link",
}: {
  label: string;
  onPress: () => void;
  role?: "link" | "button";
}) {
  const { space } = useTheme();
  return (
    <Pressable
      accessibilityRole={role}
      onPress={onPress}
      hitSlop={{ left: space.xxs, right: space.xxs }}
      style={{ minHeight: TARGET, justifyContent: "center" }}
    >
      {({ pressed }) => (
        <Text
          size="s"
          weight="medium"
          style={{ textDecorationLine: "underline", opacity: pressed ? 0.6 : 1 }}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

/**
 * Signs a visitor in, or creates their account: the providers the instance offers, then the
 * address and the password, which the phone's passwords fill and keep, the username at a sign-up,
 * and at the bottom a line that switches from one to the other. One form does both, as the web's
 * `AuthForm` does, with its words: decision 070.
 */
export function AuthForm({ mode, onModeChange, onSignedIn, invitation }: AuthFormProps) {
  const { space, motion } = useTheme();
  const queryClient = useQueryClient();
  const tell = useTell();
  const { openPage } = useOpenPage();
  const isSignUp = mode === "sign-up";

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [wasSent, setWasSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [providerPending, setProviderPending] = useState(false);
  const [refusal, setRefusal] = useState<string>();
  const [usernameRefused, setUsernameRefused] = useState<{ of: string; why: string }>();

  const emailRef = useRef<TextInputInstance>(null);
  const passwordRef = useRef<TextInputInstance>(null);

  const isFree = useUsernameFree(isSignUp ? username : "");
  const usernameWords = usernameSays({ username, isFree, wasSent, refusal: usernameRefused });
  const emailError = wasSent ? emailFault(email) : undefined;
  const passwordError = wasSent ? passwordFault(password) : undefined;
  const busy = sending || providerPending;

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

  async function send() {
    setWasSent(true);
    setRefusal(undefined);
    const address = email.trim();
    const faulty =
      emailFault(address) ??
      passwordFault(password) ??
      (isSignUp ? usernameFault(username) : undefined);
    if (faulty || busy) {
      if (faulty) feel("failed");
      return;
    }
    setSending(true);
    const fetchOptions = { headers: { "expo-origin": APP_ORIGIN, "X-App": appHeader() } };
    const answer = await (
      isSignUp
        ? // The sign-in library asks every account for a name: a new one gives its username,
          // which is what it is called by.
          authClient.signUp.email({
            email: address,
            password,
            name: username,
            username,
            ...(invitation !== undefined && { invitation }),
            fetchOptions,
          })
        : authClient.signIn.email({ email: address, password, fetchOptions })
    ).catch(() => null);
    setSending(false);
    if (!answer || answer.error) {
      feel("failed");
      const code = answer?.error.code;
      const words = refusalWords(code, answer?.error.message);
      // A username the library refused is said under its field, for the name it refused.
      if (isSignUp && code?.startsWith("USERNAME")) {
        setUsernameRefused({ of: username, why: words });
      } else {
        setRefusal(words);
      }
      return;
    }
    feel("done");
    if (isSignUp) void announceCheck(address);
    onSignedIn();
  }

  return (
    <Animated.View layout={LinearTransition.duration(motion.duration)} style={{ gap: space.m }}>
      <ProviderSignIn
        invitation={invitation}
        disabled={sending}
        onPendingChange={setProviderPending}
        onSignedIn={onSignedIn}
        onRefused={setRefusal}
      />

      {isSignUp ? (
        <Animated.View
          entering={FadeIn.duration(motion.duration)}
          exiting={FadeOut.duration(motion.duration)}
        >
          <Field
            label={m.auth_username()}
            value={username}
            onChangeText={(typed) => setUsername(typedUsername(typed))}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            // The name others read is no part of what the keychain keeps: the address is.
            textContentType="nickname"
            autoComplete="off"
            maxLength={USERNAME_MAX}
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => emailRef.current?.focus()}
            disabled={busy}
            error={usernameWords.error}
            hint={usernameWords.hint}
          />
        </Animated.View>
      ) : null}

      <Field
        ref={emailRef}
        label={m.auth_email()}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        // The address is what signs in: the keychain keeps it beside the password.
        textContentType="username"
        autoComplete="email"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => passwordRef.current?.focus()}
        disabled={busy}
        error={emailError}
      />
      <Field
        ref={passwordRef}
        label={m.auth_password()}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        textContentType={isSignUp ? "newPassword" : "password"}
        autoComplete={isSignUp ? "new-password" : "current-password"}
        passwordRules={isSignUp ? "minlength: 8; maxlength: 128;" : undefined}
        maxLength={PASSWORD_MAX}
        returnKeyType="go"
        onSubmitEditing={() => void send()}
        disabled={busy}
        error={passwordError}
      />

      {refusal ? (
        <Text tone="danger" size="s" accessibilityRole="alert" accessibilityLiveRegion="polite">
          {refusal}
        </Text>
      ) : null}

      <Button fill loading={sending} disabled={providerPending} onPress={() => void send()}>
        {isSignUp ? m.auth_create_account() : m.auth_sign_in()}
      </Button>

      {/* A sign-up says what it accepts, and a sign-in offers a new password in the same place. */}
      {isSignUp ? (
        <View style={{ alignItems: "center" }}>
          <Text size="s" tone="muted" style={{ textAlign: "center" }}>
            {m.auth_accept_terms()}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.m }}>
            <SmallLink label={m.terms_title()} onPress={() => void openPage("terms")} />
            <SmallLink label={m.privacy_title()} onPress={() => void openPage("privacy")} />
          </View>
        </View>
      ) : (
        <View style={{ alignItems: "center" }}>
          <SmallLink
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
          label={isSignUp ? m.auth_sign_in() : m.auth_create_account()}
          role="button"
          onPress={() => {
            if (busy) return;
            setWasSent(false);
            setRefusal(undefined);
            onModeChange(isSignUp ? "sign-in" : "sign-up");
          }}
        />
      </View>
    </Animated.View>
  );
}
