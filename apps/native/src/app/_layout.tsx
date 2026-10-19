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
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="create" options={formSheet({ detents: "fit" })} />
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
