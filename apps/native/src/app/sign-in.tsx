import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { AuthForm } from "@/components/auth/auth-form";
import { type AuthMode, signInParams } from "@/components/auth/sign-in-words";
import { SheetHeader } from "@/components/ui/sheet";
import { Text } from "@/components/ui/text";
import type { Route } from "@/lib/links";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

/**
 * Signs in or creates an account, in a sheet that says what it was opened for (`?reason=`), goes
 * on to `?next=` once signed in or closes, and carries the link of `?invite=` into a sign-up:
 * decisions 039, 041 and 070.
 */
export default function SignInScreen() {
  const { colors, space } = useTheme();
  const params = signInParams(useLocalSearchParams());
  const [mode, setMode] = useState<AuthMode>(params.mode);

  const done = () => {
    // A path of the app, which `insideNext` checked; the router's types read only those written.
    if (params.next) router.replace(params.next as Route);
    else if (router.canGoBack()) router.back();
    else router.replace("/");
  };

  return (
    <KeyboardAwareScrollView
      style={{ flex: 1, backgroundColor: colors["cte-canvas"] }}
      contentContainerStyle={{ paddingBottom: space.xl }}
      keyboardShouldPersistTaps="handled"
      bottomOffset={space.l}
    >
      <SheetHeader
        title={mode === "sign-up" ? m.auth_create_account() : m.auth_sign_in()}
        onCancel={() => (router.canGoBack() ? router.back() : router.replace("/"))}
      />
      <View style={{ gap: space.l, paddingHorizontal: space.m, paddingTop: space.xs }}>
        {params.reason ? (
          <Text tone="muted" style={{ textAlign: "center" }}>
            {params.reason}
          </Text>
        ) : null}
        <AuthForm mode={mode} onModeChange={setMode} invitation={params.invite} onSignedIn={done} />
      </View>
    </KeyboardAwareScrollView>
  );
}
