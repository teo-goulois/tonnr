import "@/global.css";
// `localStorage`, as the web has it, kept by SQLite: what the app shares with the web keeps
// what a browser keeps in it the same way.
import "expo-sqlite/localStorage/install";
import "@/lib/i18n";

import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { HeroUINativeProvider } from "heroui-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";

import { queryClient } from "@/utils/orpc";

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardProvider>
          <HeroUINativeProvider>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen
                name="create"
                options={{
                  presentation: "formSheet",
                  sheetAllowedDetents: "fitToContents",
                  sheetGrabberVisible: true,
                }}
              />
            </Stack>
          </HeroUINativeProvider>
        </KeyboardProvider>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}
