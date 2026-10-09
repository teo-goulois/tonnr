import { Button } from "@repo/ui/components/ui/button";
import { MoonIcon, SunIcon } from "@repo/ui/icon";
import { useTheme } from "next-themes";

import { useShortcuts } from "@/lib/shortcuts";
import { m } from "@/paraglide/messages.js";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const hotkey = useShortcuts()["toggle-theme"];

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={m.toggle_theme()}
      aria-keyshortcuts={hotkey || undefined}
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      {/* Both icons are rendered and CSS picks one, so the server needs no theme. */}
      <SunIcon data-slot="icon" aria-hidden className="dark:hidden" />
      <MoonIcon data-slot="icon" aria-hidden className="hidden dark:block" />
    </Button>
  );
}
