import { useTheme } from "next-themes";

import { switchLocale } from "@/lib/languages";
import { useShortcut, useShortcuts } from "@/lib/shortcuts";

// Registers the shortcuts that work on every page. It renders nothing.
export function AppHotkeys() {
  const bindings = useShortcuts();
  const { resolvedTheme, setTheme } = useTheme();

  useShortcut("toggle-theme", bindings, () =>
    setTheme(resolvedTheme === "dark" ? "light" : "dark"),
  );
  useShortcut("switch-locale", bindings, switchLocale);

  return null;
}
