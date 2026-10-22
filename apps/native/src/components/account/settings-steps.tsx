import { Stack } from "expo-router";
import type { ReactElement, ReactNode } from "react";
import type { RefreshControlProps } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { useTheme } from "@/lib/theme";

// The frame of the steps one press into the account's tab, which the web opens one step into its
// panel: the alerts' settings, the profile, the log, the contributions, the friends, the blocked
// accounts, the username and what deletes the account. The settings the web chooses in place, the
// units, the theme, the colors of the week's table, the density and the language, are chosen in
// place in the tab too.

/**
 * A step of the account's tab: its title, large over what it holds, as the tab's stack draws
 * every title (`tabStackOptions`), and what it holds under it, scrolled, kept clear of the
 * keyboard as a field takes it.
 */
export function Step({
  title,
  refreshControl,
  children,
}: {
  title: string;
  refreshControl?: ReactElement<RefreshControlProps>;
  children: ReactNode;
}) {
  const { colors, space } = useTheme();
  return (
    <>
      <Stack.Screen options={{ title }} />
      <KeyboardAwareScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        bottomOffset={space.l}
        refreshControl={refreshControl}
        style={{ flex: 1, backgroundColor: colors["cte-canvas"] }}
        contentContainerStyle={{ gap: space.l, padding: space.m, paddingBottom: space.xxl }}
      >
        {children}
      </KeyboardAwareScrollView>
    </>
  );
}
