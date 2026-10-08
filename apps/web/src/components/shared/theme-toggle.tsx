import { Button } from "@repo/ui/components/ui/button";
import { MoonIcon, SunIcon } from "@repo/ui/icon";
import { useTheme } from "next-themes";

import { useShortcuts } from "@/lib/shortcuts";

import { ShortcutKeys } from "./shortcut-keys";

export function ThemeToggle({ label }: { label: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const hotkey = useShortcuts()["toggle-theme"];

  return (
    <Button
      variant="ghost"
      aria-label={label}
      aria-keyshortcuts={hotkey || undefined}
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      {/* Both icons are rendered and CSS picks one, so the server needs no theme. */}
      <SunIcon data-slot="icon" aria-hidden className="dark:hidden" />
      <MoonIcon data-slot="icon" aria-hidden className="hidden dark:block" />
      <ShortcutKeys hotkey={hotkey} className="max-sm:hidden" />
    </Button>
  );
}
