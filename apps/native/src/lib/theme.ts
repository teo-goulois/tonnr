// The choice is read as the module is, whatever imports it first: what keeps it comes first.
import "expo-sqlite/localStorage/install";

import type { Theme } from "expo-router";
import { useSyncExternalStore } from "react";
import { Uniwind, useUniwind } from "uniwind";

import {
  border,
  dark,
  fonts,
  light,
  motion,
  radius,
  space,
  type,
  type ThemeColors,
} from "@/theme/tokens";

import { THEME_KEY, type ThemeChoice, themeChoiceOf } from "./theme-choice";

// The theme in force and the one a person chose: the system's, light or dark, kept on the
// phone as the web's browser keeps it, and set with Uniwind, which also tells the platform, so
// that what it draws itself (the tabs, a sheet, a switch) follows (decision 040). The account's
// panel offers the choice through `useTheme().choose`.

/** The choice kept on the phone, or the system's. */
export function startingTheme(): ThemeChoice {
  return themeChoiceOf(localStorage.getItem(THEME_KEY));
}

// What was chosen, held here: Uniwind says the theme in force, which a `ScopedTheme` changes
// for what it holds, and not what the person chose.
let chosen = startingTheme();
const listeners = new Set<() => void>();

/** Puts a theme in force, and keeps the choice on the phone. */
export function chooseTheme(choice: ThemeChoice) {
  chosen = choice;
  localStorage.setItem(THEME_KEY, choice);
  Uniwind.setTheme(choice);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

Uniwind.setTheme(chosen);

export type TonnrTheme = {
  /** The theme in force: the system's when the choice is, or what a `ScopedTheme` draws. */
  scheme: "light" | "dark";
  colors: ThemeColors;
  /** What was chosen. */
  choice: ThemeChoice;
  choose: (choice: ThemeChoice) => void;
  space: typeof space;
  type: typeof type;
  radius: typeof radius;
  border: typeof border;
  fonts: typeof fonts;
  motion: typeof motion;
};

/** The tokens of the theme in force, drawn again when it changes. */
export function useTheme(): TonnrTheme {
  const { theme } = useUniwind();
  const choice = useSyncExternalStore(subscribe, () => chosen);
  const scheme = theme === "dark" ? "dark" : "light";
  return {
    scheme,
    colors: scheme === "dark" ? dark : light,
    choice,
    choose: chooseTheme,
    space,
    type,
    radius,
    border,
    fonts,
    motion,
  };
}

/**
 * The theme as the navigation draws it, in its headers, its sheets and behind a screen: the
 * canvas, the text and the edge of the theme in force, in Geist.
 */
export function navigationTheme(scheme: "light" | "dark"): Theme {
  const colors = scheme === "dark" ? dark : light;
  return {
    dark: scheme === "dark",
    colors: {
      primary: colors["color-1"],
      background: colors["cte-canvas"],
      card: colors["cte-canvas"],
      text: colors["cte-text"],
      border: colors["neutral-4"],
      notification: colors.error,
    },
    fonts: {
      regular: { fontFamily: fonts.regular, fontWeight: "400" },
      medium: { fontFamily: fonts.medium, fontWeight: "500" },
      bold: { fontFamily: fonts.heavy, fontWeight: "700" },
      heavy: { fontFamily: fonts.heavy, fontWeight: "700" },
    },
  };
}
