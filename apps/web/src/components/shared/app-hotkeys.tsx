import { useTheme } from "next-themes";

import { useShortcut, useShortcuts } from "@/lib/shortcuts";
import { getLocale, setLocale } from "@/paraglide/runtime.js";

// Registers the shortcuts that work on every page. It renders nothing.
export function AppHotkeys() {
  const bindings = useShortcuts();
  const { resolvedTheme, setTheme } = useTheme();

  useShortcut("toggle-theme", bindings, () =>
    setTheme(resolvedTheme === "dark" ? "light" : "dark"),
  );
  useShortcut("switch-locale", bindings, () => void setLocale(getLocale() === "fr" ? "en" : "fr"));

  return null;
}
