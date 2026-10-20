// Intl's plural rules and relative times, which Hermes lacks, before anything writes one.
import "@/lib/intl";
import "@/global.css";
// `localStorage`, as the web has it, kept by SQLite: what the app shares with the web keeps
// what a browser keeps in it the same way.
import "expo-sqlite/localStorage/install";
import "@/lib/i18n";
// The theme that was chosen, put in force before anything is drawn.
import "@/lib/theme";

import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, ThemeProvider } from "expo-router";
import { HeroUINativeProvider } from "heroui-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";

import { PushListener } from "@/components/shared/push-listener";
import { formSheet } from "@/components/ui/sheet-options";
import { navigationTheme, useTheme } from "@/lib/theme";
import { queryClient } from "@/utils/orpc";

export default function RootLayout() {
  const { scheme } = useTheme();
  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardProvider>
          <HeroUINativeProvider>
            <ThemeProvider value={navigationTheme(scheme)}>
              <PushListener />
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="create" options={formSheet({ detents: "fit" })} />
                <Stack.Screen name="pause-alert" options={formSheet({ detents: "fit" })} />
                {/* A place opens low, over the map that stays alive under it, and rises to be
                    read: decision 040's two heights. */}
                <Stack.Screen
                  name="place/[kind]/[id]"
                  options={formSheet({ detents: [0.45, 0.94], undimmedUpTo: 0 })}
                />
                <Stack.Screen name="search" options={formSheet({ detents: [0.94] })} />
                <Stack.Screen name="alert/new" options={formSheet()} />
                <Stack.Screen name="alert/[id]" options={formSheet()} />
                <Stack.Screen name="session/new" options={formSheet()} />
                <Stack.Screen name="session/[id]" options={formSheet()} />
                <Stack.Screen name="report/new" options={formSheet()} />
                <Stack.Screen name="spot/new" options={formSheet()} />
                <Stack.Screen name="list/[id]" options={{ headerShown: true }} />
                <Stack.Screen name="shared/[token]" options={{ headerShown: true }} />
                <Stack.Screen name="sign-in" options={formSheet()} />
                <Stack.Screen name="forgot-password" options={formSheet()} />
                <Stack.Screen name="reset-password" options={formSheet()} />
                <Stack.Screen name="onboarding" options={{ presentation: "fullScreenModal" }} />
                <Stack.Screen
                  name="media/[id]"
                  options={{ presentation: "fullScreenModal", animation: "fade" }}
                />
                {/* Development only: each route sends a build for testers or a store to the map. */}
                <Stack.Screen
                  name="design-system"
                  options={{ headerShown: true, headerLargeTitle: true, title: "Design system" }}
                />
                <Stack.Screen
                  name="design-system-sheet"
                  options={formSheet({ detents: [0.6, 1] })}
                />
              </Stack>
            </ThemeProvider>
          </HeroUINativeProvider>
        </KeyboardProvider>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}
