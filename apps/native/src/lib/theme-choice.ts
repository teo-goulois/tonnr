// The theme a person chooses, as the web keeps it: decision 040 offers three in the account's
// panel. A module of its own, which imports nothing of React Native, so that a test reads it.

/** The system's, light or dark, in the order the account's panel offers them. */
export const THEME_CHOICES = ["system", "light", "dark"] as const;

export type ThemeChoice = (typeof THEME_CHOICES)[number];

/** Where the phone keeps the choice: the key the web's browser keeps it under. */
export const THEME_KEY = "theme";

/** The choice that was kept, or the system's when none was or it names no theme. */
export function themeChoiceOf(kept: string | null | undefined): ThemeChoice {
  return THEME_CHOICES.find((choice) => choice === kept) ?? "system";
}
