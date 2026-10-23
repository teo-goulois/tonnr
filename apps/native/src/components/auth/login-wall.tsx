import { APP_NAME } from "@repo/config/app";
import { isClosedToVisitors } from "@repo/client/visitors";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useGlobalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { AppState, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FormScroll } from "@/components/ui/form";
import { Text } from "@/components/ui/text";
import { useAccount } from "@/lib/account";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

import { AuthForm } from "./auth-form";
import type { AuthMode } from "./sign-in-words";

const MINUTE_MS = 60 * 1000;

// The web's column of one page (`PageColumn`), `max-w-(--container-sm)`: 24rem, which a large
// phone is wider than.
const COLUMN_MOST = 384;

/**
 * Whether a visitor meets the wall: the instance is closed to visitors, as `visitors.get` says
 * or as a refusal of any call says since, and nobody is signed in. Closed, it is asked again
 * every minute and as the app comes back, so that the wall falls as soon as the instance opens.
 * An API that does not say is taken as open: the screens say themselves what they cannot load.
 * Decision 039.
 */
export function useVisitorWall() {
  const { signedIn, pending } = useAccount();
  const queryClient = useQueryClient();
  const visitors = useQuery(
    orpc.v1.visitors.get.queryOptions({
      enabled: !pending && !signedIn,
      staleTime: (query) => (query.state.data?.open === false ? 0 : 5 * MINUTE_MS),
      refetchInterval: (query) => (query.state.data?.open === false ? MINUTE_MS : false),
      retry: false,
    }),
  );
  const closed = visitors.data?.open === false;
  const { refetch } = visitors;

  // Whatever a visitor was reading, a refusal that says the instance closed puts up the wall.
  useEffect(() => {
    const key = orpc.v1.visitors.get.queryKey();
    return queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== "updated" || event.action.type !== "error") return;
      if (!isClosedToVisitors(event.action.error)) return;
      if (queryClient.getQueryData(key)?.open === false) return;
      queryClient.setQueryData(key, { open: false });
    });
  }, [queryClient]);

  // Closed, it asks again as the app comes back to the screen.
  useEffect(() => {
    if (!closed) return;
    const listening = AppState.addEventListener("change", (state) => {
      if (state === "active") void refetch();
    });
    return () => listening.remove();
  }, [closed, refetch]);

  return !pending && !signedIn && closed;
}

/**
 * What the app shows in place of its tabs while the instance is closed to visitors, as the web's
 * `LoginWall` in its page's column: why, and the form that signs in or creates an account, with
 * the link of `?invite=` that brought the visitor, which a sign-up keeps (decision 041). It has
 * no tabs: it leads nowhere but in. Decisions 039 and 040.
 */
export function LoginWall() {
  const { colors, space } = useTheme();
  const insets = useSafeAreaInsets();
  const { invite } = useGlobalSearchParams<{ invite?: string }>();
  const invitation = typeof invite === "string" && invite.length > 0 ? invite : undefined;
  // Whoever comes by a link comes to make an account.
  const [mode, setMode] = useState<AuthMode>(invitation ? "sign-up" : "sign-in");

  return (
    <FormScroll
      style={{ flex: 1, backgroundColor: colors["cte-canvas"] }}
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: "center",
        paddingTop: insets.top + space.xl,
        paddingBottom: insets.bottom + space.xl,
        paddingHorizontal: space.m,
      }}
    >
      <View style={{ width: "100%", maxWidth: COLUMN_MOST, alignSelf: "center", gap: space.l }}>
        <View style={{ gap: space.xs }}>
          <Text size="l" weight="medium" accessibilityRole="header">
            {m.wall_title()}
          </Text>
          <Text tone="muted">{m.wall_text({ name: APP_NAME })}</Text>
        </View>
        {/* Once signed in, the account's session takes the wall down by itself. */}
        <AuthForm
          mode={mode}
          onModeChange={setMode}
          invitation={invitation}
          onSignedIn={() => {}}
        />
      </View>
    </FormScroll>
  );
}
