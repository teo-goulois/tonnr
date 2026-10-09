import {
  Command,
  CommandCollection,
  CommandDialog,
  CommandDialogPopup,
  CommandEmpty,
  CommandGroup,
  CommandGroupLabel,
  CommandInput,
  CommandItem,
  CommandList,
  CommandPanel,
  CommandSeparator,
} from "@repo/ui/components/ui/command";
import { useNavigate } from "@tanstack/react-router";
import { useTheme } from "next-themes";
import { useState } from "react";

import { useShortcut, useShortcuts } from "@/lib/shortcuts";
import { m } from "@/paraglide/messages.js";
import { getLocale, setLocale } from "@/paraglide/runtime.js";

import { ShortcutKeys } from "./shortcut-keys";
import { openShortcutSettings } from "./shortcut-settings";

type PaletteAction = {
  // What the search matches: the label and its keywords.
  value: string;
  label: string;
  hotkey?: string;
  run: () => void;
};

type PaletteGroup = { value: string; label: string; items: PaletteAction[] };

// Every page and primary action of the app, one key press away.
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const bindings = useShortcuts();
  const { resolvedTheme, setTheme } = useTheme();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setQuery("");
  }

  useShortcut("command-palette", bindings, () => handleOpenChange(!open));

  const isDark = resolvedTheme === "dark";
  const groups: PaletteGroup[] = [
    {
      value: "navigation",
      label: m.command_group_navigation(),
      items: [
        {
          value: `${m.command_home()} home landing`,
          label: m.command_home(),
          run: () => void navigate({ to: "/" }),
        },
        {
          value: `${m.command_app()} app map spots`,
          label: m.command_app(),
          run: () => void navigate({ to: "/app" }),
        },
        {
          value: `${m.saved_title()} saved favorites lists`,
          label: m.saved_title(),
          run: () => void navigate({ to: "/app", search: { panel: "saved" } }),
        },
        {
          value: `${m.alerts_title()} alerts notifications`,
          label: m.alerts_title(),
          run: () => void navigate({ to: "/app", search: { panel: "alerts" } }),
        },
        {
          value: `${m.command_sign_in()} login account`,
          label: m.command_sign_in(),
          run: () => void navigate({ to: "/login" }),
        },
        ...(import.meta.env.DEV
          ? [
              {
                value: `${m.command_design_system()} components`,
                label: m.command_design_system(),
                run: () => void navigate({ to: "/design-system" }),
              },
            ]
          : []),
      ],
    },
    {
      value: "preferences",
      label: m.command_group_preferences(),
      items: [
        {
          value: `${m.shortcut_toggle_theme()} theme light dark`,
          label: isDark ? m.command_theme_light() : m.command_theme_dark(),
          hotkey: bindings["toggle-theme"],
          run: () => setTheme(isDark ? "light" : "dark"),
        },
        {
          value: `${m.shortcut_switch_locale()} language langue english français`,
          label: m.command_switch_locale(),
          hotkey: bindings["switch-locale"],
          run: () => void setLocale(getLocale() === "fr" ? "en" : "fr"),
        },
        {
          value: `${m.command_shortcuts()} keyboard hotkeys`,
          label: m.command_shortcuts(),
          run: openShortcutSettings,
        },
      ],
    },
  ];

  function runAction(action: PaletteAction) {
    handleOpenChange(false);
    action.run();
  }

  return (
    <CommandDialog open={open} onOpenChange={handleOpenChange}>
      <CommandDialogPopup aria-label={m.command_palette_label()}>
        <Command
          items={groups}
          itemToStringValue={(item) => (item as PaletteAction).value}
          value={query}
          onValueChange={setQuery}
        >
          <CommandInput placeholder={m.command_palette_placeholder()} />
          <CommandPanel>
            <CommandEmpty>{m.command_palette_empty()}</CommandEmpty>
            <CommandList>
              {(group: PaletteGroup, index: number) => (
                <CommandGroup key={group.value} items={group.items}>
                  <CommandGroupLabel>{group.label}</CommandGroupLabel>
                  <CommandCollection>
                    {(action: PaletteAction) => (
                      <CommandItem
                        key={action.value}
                        value={action.value}
                        className="flex items-center gap-xs"
                        onClick={() => runAction(action)}
                      >
                        <span className="flex-1 truncate">{action.label}</span>
                        {action.hotkey ? <ShortcutKeys hotkey={action.hotkey} /> : null}
                      </CommandItem>
                    )}
                  </CommandCollection>
                  {index < groups.length - 1 ? <CommandSeparator /> : null}
                </CommandGroup>
              )}
            </CommandList>
          </CommandPanel>
        </Command>
      </CommandDialogPopup>
    </CommandDialog>
  );
}
