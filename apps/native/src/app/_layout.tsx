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

import { FOLD_NONE, RAISED } from "@/components/place/fold";
import { ActivitiesListener } from "@/components/shared/activities-listener";
import { PushListener } from "@/components/shared/push-listener";
import { formSheet } from "@/components/ui/sheet-options";
import { navigationTheme, useTheme } from "@/lib/theme";
import { queryClient } from "@/utils/orpc";
import { WidgetWriter } from "@/widgets/widget-writer";

// Whatever a link opens stands over the tabs, the link that started the app too: a sheet that a
// widget, a Live Activity, a notification or a link of decision 073 opened then has the map to go
// back to once it is saved or closed, and the tabs mount what they run at each start (decision
// 074).
export const unstable_settings = { anchor: "(tabs)" };

export default function RootLayout() {
  const { scheme } = useTheme();
  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardProvider>
          <HeroUINativeProvider>
            <ThemeProvider value={navigationTheme(scheme)}>
              <PushListener />
              <WidgetWriter />
              <ActivitiesListener />
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="create" options={formSheet({ detents: "fit" })} />
                <Stack.Screen name="pause-alert" options={formSheet({ detents: "fit" })} />
                {/* A place opens low, over the map that stays alive under it, and rises to be
                    read: decision 040's two heights. The map is never dimmed, and a press on it
                    never closes the sheet, as the web's drawer stands beside the map. */}
                <Stack.Screen
                  name="place/[kind]/[id]"
                  options={formSheet({ detents: [FOLD_NONE, RAISED], undimmedUpTo: "last" })}
                />
                <Stack.Screen name="place/save" options={formSheet({ detents: "fit" })} />
                <Stack.Screen name="place/menu" options={formSheet({ detents: "fit" })} />
                <Stack.Screen name="place/move" options={formSheet()} />
                <Stack.Screen name="search" options={formSheet({ detents: [0.94] })} />
                <Stack.Screen name="alert/new" options={formSheet()} />
                <Stack.Screen name="alert/[id]" options={formSheet()} />
                <Stack.Screen name="alert/part" options={formSheet({ detents: "fit" })} />
                <Stack.Screen name="session/new" options={formSheet()} />
                {/* A session in progress, timed while it lasts: decision 074. */}
                <Stack.Screen name="session/live" options={formSheet()} />
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
