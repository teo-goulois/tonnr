import { GoogleIcon } from "@repo/ui/icon";
import { useQuery } from "@tanstack/react-query";
import { uuid } from "expo";
import * as AppleAuthentication from "expo-apple-authentication";
import { useRef, useState } from "react";
import { Platform, View } from "react-native";

import { Button } from "@/components/ui/button";
import { feel } from "@/components/ui/haptics";
import { TARGET } from "@/components/ui/metrics";
import { Separator } from "@/components/ui/separator";
import { Text } from "@/components/ui/text";
import { APP_ORIGIN, appHeader } from "@/lib/app-client";
import { authClient } from "@/lib/auth-client";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

import { refusalWords } from "./sign-in-words";

// Signing in with a provider rather than an address and a password: Apple through the system's
// own sheet, on iOS, and Google through a browser the system opens over the app and closes after.
// Decisions 046 and 070.

/** The providers an instance may offer to sign in with, Apple's first. */
export const PROVIDERS = ["apple", "google"] as const;
export type Provider = (typeof PROVIDERS)[number];

/** What came of a sign-in with a provider. */
export type ProviderOutcome =
  | { signedIn: true }
  // The person closed the sheet or the browser, or it came back with no session: nothing to say
  // for Apple, whose sheet says it was closed; for Google, which cannot say why, a line.
  | { signedIn: false; refusal?: string };

/** What this instance signs in with besides an address and a password, once it has said. */
export function useSignInProviders() {
  return useQuery({
    queryKey: ["auth", "sign-in-providers"],
    queryFn: async () => {
      const answer =
        await authClient.$fetch<Partial<Record<Provider, boolean>>>("/sign-in-providers");
      if (answer.error) throw new Error("Sign-in providers could not be read");
      return answer.data;
    },
    staleTime: 60_000,
    retry: false,
  });
}

/** Whether this phone shows Apple's sheet: an iPhone, and iOS says so. Android does not offer it. */
function useAppleHere() {
  return useQuery({
    queryKey: ["auth", "apple-here"],
    queryFn: () => AppleAuthentication.isAvailableAsync(),
    enabled: Platform.OS === "ios",
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
}

/** The providers to offer on this phone: those the instance offers, which the phone can show. */
export function useOfferedProviders() {
  const instance = useSignInProviders();
  const apple = useAppleHere();
  return PROVIDERS.filter((provider) =>
    provider === "apple"
      ? instance.data?.apple === true && apple.data === true
      : instance.data?.google === true,
  );
}

// What a call to the sign-in library says of the app besides the language, which its client
// adds: the library's Expo client leaves `expo-origin` off a sign-in by an ID token. Decision 070.
const appHeaders = () => ({ "expo-origin": APP_ORIGIN, "X-App": appHeader() });

// A nonce of 244 random bits, from the system's own generator through Expo's UUIDs: the app
// gives it to Apple, which writes it in the token, and to the API, which checks the two agree.
const newNonce = () => `${uuid.v4()}${uuid.v4()}`.replaceAll("-", "");

/**
 * Signs in with Apple through the system's sheet, then gives the API the token Apple answered,
 * with the link that brought the visitor, which a new account keeps (decision 041).
 */
export async function signInWithApple(invitation?: string): Promise<ProviderOutcome> {
  const nonce = newNonce();
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce,
    });
  } catch (error) {
    // Closing the sheet is a choice, which the sheet itself said.
    if ((error as { code?: string }).code === "ERR_REQUEST_CANCELED") return { signedIn: false };
    return { signedIn: false, refusal: m.auth_failed() };
  }
  if (!credential.identityToken) return { signedIn: false, refusal: m.auth_failed() };

  const answer = await authClient.signIn
    .social({
      provider: "apple",
      idToken: { token: credential.identityToken, nonce },
      ...(invitation && { additionalData: { invitation } }),
      fetchOptions: { headers: appHeaders() },
    })
    .catch(() => null);
  if (!answer) return { signedIn: false, refusal: m.auth_failed() };
  if (answer.error) {
    return { signedIn: false, refusal: refusalWords(answer.error.code, answer.error.message) };
  }
  return { signedIn: true };
}

/**
 * Signs in with Google in a browser the system opens over the app, which the sign-in library's
 * Expo client opens and reads the session from as it closes. It cannot say why it came back with
 * none: the person closed it, or Google or the API refused.
 */
export async function signInWithGoogle(invitation?: string): Promise<ProviderOutcome> {
  const answer = await authClient.signIn
    .social({
      provider: "google",
      // The app's own address, in its scheme, which the library's client writes in full.
      callbackURL: "/",
      errorCallbackURL: "/",
      ...(invitation && { additionalData: { invitation } }),
      fetchOptions: { headers: { "X-App": appHeader() } },
    })
    .catch(() => null);
  if (!answer || answer.error) {
    return { signedIn: false, refusal: refusalWords(answer?.error.code, answer?.error.message) };
  }
  const session = await authClient.getSession().catch(() => null);
  if (session?.data?.user) return { signedIn: true };
  return { signedIn: false, refusal: m.native_auth_google_none() };
}

/** Signs in with one provider. */
export function signInWith(provider: Provider, invitation?: string) {
  return provider === "apple" ? signInWithApple(invitation) : signInWithGoogle(invitation);
}

/**
 * The button of one provider, in the words and the look its rules ask for: Apple's is the
 * system's own, black on a light screen and white on a dark one; Google's is the theme's, with
 * Google's mark.
 */
export function ProviderButton({
  provider,
  pending,
  disabled,
  onPress,
}: {
  provider: Provider;
  pending: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const { scheme } = useTheme();
  if (provider === "apple") {
    return (
      <View
        style={{ opacity: disabled || pending ? 0.5 : 1 }}
        pointerEvents={disabled || pending ? "none" : "auto"}
        accessibilityState={{ disabled: disabled || pending, busy: pending }}
      >
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={
            scheme === "dark"
              ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
              : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
          }
          cornerRadius={TARGET / 2}
          style={{ height: TARGET, width: "100%" }}
          onPress={onPress}
        />
      </View>
    );
  }
  return (
    <Button
      variant="secondary"
      icon={GoogleIcon}
      fill
      loading={pending}
      disabled={disabled}
      onPress={onPress}
      style={{ minHeight: TARGET }}
    >
      {m.auth_google()}
    </Button>
  );
}

/**
 * A button for each provider the instance offers and this phone can show, Apple's first, over
 * the address and the password, with the line that parts them. Nothing when there is none.
 */
export function ProviderSignIn({
  invitation,
  disabled,
  onPendingChange,
  onSignedIn,
  onRefused,
}: {
  invitation?: string | undefined;
  disabled: boolean;
  onPendingChange: (pending: boolean) => void;
  onSignedIn: () => void;
  onRefused: (refusal: string | undefined) => void;
}) {
  const { space } = useTheme();
  const offered = useOfferedProviders();
  const [pending, setPending] = useState<Provider | null>(null);
  const sending = useRef(false);

  async function signIn(provider: Provider) {
    if (sending.current) return;
    sending.current = true;
    setPending(provider);
    onPendingChange(true);
    onRefused(undefined);
    const outcome = await signInWith(provider, invitation);
    sending.current = false;
    setPending(null);
    onPendingChange(false);
    if (outcome.signedIn) {
      feel("done");
      onSignedIn();
      return;
    }
    if (outcome.refusal) feel("failed");
    onRefused(outcome.refusal);
  }

  if (offered.length === 0) return null;
  return (
    <View style={{ gap: space.s }}>
      {offered.map((provider) => (
        <ProviderButton
          key={provider}
          provider={provider}
          pending={pending === provider}
          disabled={disabled || (pending !== null && pending !== provider)}
          onPress={() => void signIn(provider)}
        />
      ))}
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ flexDirection: "row", alignItems: "center", gap: space.s }}
      >
        <View style={{ flex: 1 }}>
          <Separator />
        </View>
        <Text size="s" tone="muted">
          {m.auth_or()}
        </Text>
        <View style={{ flex: 1 }}>
          <Separator />
        </View>
      </View>
    </View>
  );
}
