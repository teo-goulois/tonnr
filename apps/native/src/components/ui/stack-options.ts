import type { NativeStackNavigationOptions } from "expo-router";

import type { TonnrTheme } from "@/lib/theme";

// How a tab of the phone's bar frames its screens, the web's `ViewerScreen` as a native stack
// draws it (decision 040): the title in Geist medium, as the web's `h1` is, the first screen's
// large and at the start as the web's stands, on the theme's canvas with no line under the bar,
// and a back button in the theme's ink that says no word. The stack, its back gesture and its
// large title that folds as the screen scrolls stay the platform's.

/** The options of a tab's stack, for its `Stack`'s `screenOptions`. */
export function tabStackOptions({
  colors,
  fonts,
}: Pick<TonnrTheme, "colors" | "fonts">): NativeStackNavigationOptions {
  return {
    headerTransparent: false,
    headerShadowVisible: false,
    headerStyle: { backgroundColor: colors["cte-canvas"] },
    headerTintColor: colors["neutral-10"],
    headerTitleStyle: { fontFamily: fonts.medium, color: colors["neutral-10"] },
    headerLargeTitleStyle: { fontFamily: fonts.medium, color: colors["neutral-10"] },
    headerBackButtonDisplayMode: "minimal",
    contentStyle: { backgroundColor: colors["cte-canvas"] },
  };
}
