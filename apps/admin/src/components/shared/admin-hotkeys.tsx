import { useNavigate } from "@tanstack/react-router";
import { useTheme } from "next-themes";

import { useShortcut, useShortcuts } from "@/lib/shortcuts";
import { getLocale, setLocale } from "@/paraglide/runtime.js";

// Registers the shortcuts that work on every page of the admin. It renders nothing.
export function AdminHotkeys() {
  const bindings = useShortcuts();
  const navigate = useNavigate();
  const { resolvedTheme, setTheme } = useTheme();

  useShortcut("toggle-theme", bindings, () =>
    setTheme(resolvedTheme === "dark" ? "light" : "dark"),
  );
  useShortcut("switch-locale", bindings, () => void setLocale(getLocale() === "fr" ? "en" : "fr"));
  useShortcut(
    "new-developer",
    bindings,
    () => void navigate({ to: "/developers", search: { new: true } }),
  );

  return null;
}
