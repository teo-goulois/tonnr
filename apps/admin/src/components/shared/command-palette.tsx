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
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useTheme } from "next-themes";
import { useEffect, useState, useSyncExternalStore } from "react";

import { useShortcut, useShortcuts } from "@/lib/shortcuts";
import { m } from "@/paraglide/messages.js";
import { getLocale, setLocale } from "@/paraglide/runtime.js";
import { orpc } from "@/utils/orpc";

import { useSignOut } from "./account-menu";
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

// A module-level store, so that the button of the bar opens the palette as its shortcut does.
let isOpen = false;
const listeners = new Set<() => void>();

function setOpen(next: boolean) {
  isOpen = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function openCommandPalette() {
  setOpen(true);
}

// Every page and primary action of the admin, one key press away, and each developer account
// by its name.
export function CommandPalette() {
  const open = useSyncExternalStore(
    subscribe,
    () => isOpen,
    () => false,
  );
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const bindings = useShortcuts();
  const signOut = useSignOut();
  const { resolvedTheme, setTheme } = useTheme();
  // The accounts are asked for when the palette first opens, and not before.
  const developers = useQuery(
    orpc.v1.developers.list.queryOptions({ enabled: open, meta: { quiet: true } }),
  );

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setQuery("");
  }

  // Its shortcut closes it as well. Over another dialog it does nothing: choosing a page there
  // would leave what the dialog shows.
  useShortcut("command-palette", bindings, () => handleOpenChange(!open), { evenInDialog: open });
  // The palette does not stay open for whoever signs in next.
  useEffect(() => () => setOpen(false), []);

  const isDark = resolvedTheme === "dark";
  const groups: PaletteGroup[] = [
    {
      value: "navigation",
      label: m.command_group_navigation(),
      items: [
        {
          value: `${m.nav_overview()} overview calls usage stats`,
          label: m.nav_overview(),
          run: () => void navigate({ to: "/" }),
        },
        {
          value: `${m.nav_developers()} developers keys`,
          label: m.nav_developers(),
          run: () => void navigate({ to: "/developers" }),
        },
        {
          value: `${m.nav_activity()} activity history log journal`,
          label: m.nav_activity(),
          run: () => void navigate({ to: "/activity" }),
        },
        {
          value: `${m.nav_accounts()} accounts users`,
          label: m.nav_accounts(),
          run: () => void navigate({ to: "/accounts" }),
        },
      ],
    },
    {
      value: "actions",
      label: m.command_group_actions(),
      items: [
        {
          value: `${m.developer_new()} new create add`,
          label: m.developer_new(),
          hotkey: bindings["new-developer"],
          run: () => void navigate({ to: "/developers", search: { new: true } }),
        },
      ],
    },
    {
      value: "developers",
      label: m.nav_developers(),
      items: (developers.data?.developers ?? []).map((developer) => ({
        // Two accounts may have one name: the id tells them apart for the list.
        value: `${developer.name} ${developer.contact ?? ""} ${developer.id}`,
        label: developer.name,
        run: () =>
          void navigate({ to: "/developers/$developerId", params: { developerId: developer.id } }),
      })),
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
        {
          value: `${m.auth_sign_out()} logout sign out`,
          label: m.auth_sign_out(),
          run: signOut,
        },
      ],
    },
  ].filter((group) => group.items.length > 0);

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
