import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { AuthForm } from "@/components/auth/auth-form";
import { type AuthMode, signInParams } from "@/components/auth/sign-in-words";
import { FormScroll } from "@/components/ui/form";
import { PanelHeader } from "@/components/ui/sheet";
import type { Route } from "@/lib/links";
import { takeFollowUp } from "@/lib/require-account";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

/**
 * Signs in or creates an account, in a sheet that says what it was opened for (`?reason=`), goes
 * on to `?next=` once signed in or closes and does what the prompt that opened it asked
 * (`?follow=`), and carries the link of `?invite=` into a sign-up: decisions 039, 041 and 070.
 * Its head is the web's prompt (`AuthPromptProvider`): the title at the start, why an account is
 * asked for in the muted ink under it, and the cross; everything scrolls together, as the web's
 * dialog does, with the form a step of room under its head.
 */
export default function SignInScreen() {
  const { colors, space } = useTheme();
  const params = signInParams(useLocalSearchParams());
  const [mode, setMode] = useState<AuthMode>(params.mode);

  const done = () => {
    // What the prompt that opened the sheet was for, which goes on once the sheet has closed.
    const then = takeFollowUp(params.follow);
    // A path of the app, which `insideNext` checked; the router's types read only those written.
    if (params.next) router.replace(params.next as Route);
    else if (router.canGoBack()) router.back();
    else router.replace("/");
    then?.();
  };

  return (
    <FormScroll
      style={{ flex: 1, backgroundColor: colors["neutral-1"] }}
      contentContainerStyle={{ paddingBottom: space.xl }}
    >
      <PanelHeader
        title={mode === "sign-up" ? m.auth_create_account() : m.auth_sign_in()}
        description={params.reason}
        dialog
        gap={space.xxs}
        onClose={() => (router.canGoBack() ? router.back() : router.replace("/"))}
      />
      <View style={{ paddingHorizontal: space.m, paddingTop: space.m }}>
        <AuthForm mode={mode} onModeChange={setMode} invitation={params.invite} onSignedIn={done} />
      </View>
    </FormScroll>
  );
}
