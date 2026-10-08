import { Button } from "@repo/ui/components/button";
import { MoonIcon, SunIcon } from "@repo/ui/icon";

function toggleTheme() {
  const isDark = document.documentElement.classList.toggle("dark");
  localStorage.theme = isDark ? "dark" : "light";
}

export function ThemeToggle({ label }: { label: string }) {
  return (
    <Button variant="ghost" size="icon" aria-label={label} onClick={toggleTheme}>
      <SunIcon aria-hidden className="dark:hidden" />
      <MoonIcon aria-hidden className="hidden dark:block" />
    </Button>
  );
}
