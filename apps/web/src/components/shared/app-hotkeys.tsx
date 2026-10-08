import { useHotkey } from "@tanstack/react-hotkeys";
import { useTheme } from "next-themes";

import { SHORTCUTS } from "@/lib/shortcuts";

// Registers the shortcuts that work on every page. It renders nothing.
export function AppHotkeys() {
  const { resolvedTheme, setTheme } = useTheme();

  useHotkey(
    SHORTCUTS.toggleTheme.hotkey,
    () => setTheme(resolvedTheme === "dark" ? "light" : "dark"),
    { preventDefault: true, requireReset: true, stopPropagation: true },
  );

  return null;
}
