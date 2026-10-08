import { Button } from "@repo/ui/components/ui/button";
import { Kbd } from "@repo/ui/components/ui/kbd";
import { MoonIcon, SunIcon } from "@repo/ui/icon";
import { useTheme } from "next-themes";

import { SHORTCUTS } from "@/lib/shortcuts";

export function ThemeToggle({ label }: { label: string }) {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      aria-label={label}
      aria-keyshortcuts={SHORTCUTS.toggleTheme.hotkey}
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      {/* Both icons are rendered and CSS picks one, so the server needs no theme. */}
      <SunIcon data-slot="icon" aria-hidden className="dark:hidden" />
      <MoonIcon data-slot="icon" aria-hidden className="hidden dark:block" />
      <Kbd className="max-sm:hidden">{SHORTCUTS.toggleTheme.hotkey}</Kbd>
    </Button>
  );
}
