import { useNavigate } from "@tanstack/react-router";
import { useTheme } from "next-themes";

import { type ShortcutBindings, useShortcut, useShortcuts } from "@/lib/shortcuts";
import { getLocale, setLocale } from "@/paraglide/runtime.js";

// The shortcuts of whoever reads, an operator or not: the theme and the language.
function usePreferenceHotkeys(bindings: ShortcutBindings) {
  const { resolvedTheme, setTheme } = useTheme();

  useShortcut("toggle-theme", bindings, () =>
    setTheme(resolvedTheme === "dark" ? "light" : "dark"),
  );
  useShortcut("switch-locale", bindings, () => void setLocale(getLocale() === "fr" ? "en" : "fr"));
}

// Registers the shortcuts that work on every page of an operator's admin. It renders nothing.
export function AdminHotkeys() {
  const bindings = useShortcuts();
  const navigate = useNavigate();

  usePreferenceHotkeys(bindings);
  useShortcut(
    "new-developer",
    bindings,
    () => void navigate({ to: "/developers", search: { new: true } }),
  );

  return null;
}

// Registers the shortcuts of the console: an operator's own actions are not among them.
export function ConsoleHotkeys() {
  usePreferenceHotkeys(useShortcuts());
  return null;
}
