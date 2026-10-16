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
import { useState, useSyncExternalStore } from "react";

import { authClient } from "@/lib/auth-client";
import { LANGUAGES, nextLocale } from "@/lib/languages";
import { useRecents } from "@/lib/recents";
import { useShortcut, useShortcuts } from "@/lib/shortcuts";
import { useDebounced } from "@/lib/use-debounced";
import { analyticsConfigured } from "@/lib/analytics";
import { m } from "@/paraglide/messages.js";
import { getLocale, locales, setLocale } from "@/paraglide/runtime.js";
import { orpc } from "@/utils/orpc";

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

// The catalogue is asked once the keys have stopped, from this many characters.
const SEARCH_WAIT_MS = 250;
const SEARCH_FROM = 2;
const BREAKS_MOST = 6;

// A module-level store, so that a button of the map can open the palette from outside it.
let isOpen = false;
const listeners = new Set<() => void>();

function setOpen(next: boolean) {
  if (isOpen === next) return;
  isOpen = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Opens the palette, where a spot is found by its name. */
export function openCommandPalette() {
  setOpen(true);
}

// Every page and primary action of the app, one key press away.
export function CommandPalette() {
  const open = useSyncExternalStore(
    subscribe,
    () => isOpen,
    () => false,
  );
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const bindings = useShortcuts();
  const { resolvedTheme, setTheme } = useTheme();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setQuery("");
  }

  useShortcut("command-palette", bindings, () => handleOpenChange(!open));

  // The account's lists are asked for when the palette first opens, and not before.
  const session = authClient.useSession();
  const saved = useQuery(
    orpc.v1.lists.list.queryOptions({
      enabled: open && Boolean(session.data),
      meta: { quiet: true },
    }),
  );
  const lists = [...(saved.data?.lists ?? []), ...(saved.data?.joined ?? [])];

  const recents = useRecents();

  // A spot is found by its name: the account's own, which the palette is given whole, and the
  // breaks of the catalogue, which the API searches once the keys have stopped.
  const spots = useQuery(
    orpc.v1.spots.list.queryOptions({
      enabled: open && Boolean(session.data),
      select: (answer) => answer.spots,
      meta: { quiet: true },
    }),
  );
  const typed = query.trim();
  const asked = useDebounced(typed, SEARCH_WAIT_MS);
  const isAsking = open && typed.length >= SEARCH_FROM && asked === typed;
  const breaks = useQuery(
    orpc.v1.breaks.search.queryOptions({
      input: { q: asked, limit: BREAKS_MOST },
      enabled: isAsking,
      staleTime: 10 * 60 * 1000,
      meta: { quiet: true },
    }),
  );
  const foundBreaks = isAsking ? (breaks.data?.breaks ?? []) : [];

  const isDark = resolvedTheme === "dark";
  const groups: PaletteGroup[] = [
    // What the reader looked at last comes first: it is what an open palette shows before a key.
    ...(recents.length > 0
      ? [
          {
            value: "recents",
            label: m.recents_title(),
            items: recents.map((recent) => ({
              value: `${recent.name} recent récent ${recent.kind} ${recent.id}`,
              label: recent.name,
              run: () =>
                void navigate({
                  to: "/app",
                  search:
                    recent.kind === "station"
                      ? { station: recent.id }
                      : recent.kind === "break"
                        ? { break: recent.id }
                        : { spot: recent.id },
                }),
            })),
          },
        ]
      : []),
    ...((spots.data?.length ?? 0) > 0
      ? [
          {
            value: "spots",
            label: m.spots_title(),
            items: (spots.data ?? []).map((spot) => ({
              value: `${spot.name} spot ${spot.id}`,
              label: spot.name,
              run: () => void navigate({ to: "/app", search: { spot: spot.id } }),
            })),
          },
        ]
      : []),
    ...(foundBreaks.length > 0
      ? [
          {
            value: "breaks",
            label: m.map_breaks(),
            items: foundBreaks.map((found) => ({
              // The API read the name without its marks: what is typed stands in the value, so
              // that the palette, which reads them, keeps what was found.
              value: `${found.name} ${typed} ${found.id}`,
              label: found.name,
              run: () => void navigate({ to: "/app", search: { break: found.id } }),
            })),
          },
        ]
      : []),
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
          value: `${m.page_spots()} spots pages countries regions`,
          label: m.page_spots(),
          run: () => void navigate({ to: "/spots" }),
        },
        {
          value: `${m.learn_footer()} learn guide forecast read lire apprendre`,
          label: m.learn_footer(),
          run: () => void navigate({ to: "/learn" }),
        },
        {
          value: `${m.learn_beginner_title()} learn beginner guide basics`,
          label: m.learn_beginner_title(),
          run: () => void navigate({ to: "/learn/beginner" }),
        },
        {
          value: `${m.learn_intermediate_title()} learn intermediate guide week window`,
          label: m.learn_intermediate_title(),
          run: () => void navigate({ to: "/learn/intermediate" }),
        },
        {
          value: `${m.learn_advanced_title()} learn advanced guide models buoys`,
          label: m.learn_advanced_title(),
          run: () => void navigate({ to: "/learn/advanced" }),
        },
        {
          value: `${m.learn_glossary_title()} learn glossary words`,
          label: m.learn_glossary_title(),
          run: () => void navigate({ to: "/learn/glossary" }),
        },
        {
          value: `${m.saved_title()} saved favorites lists`,
          label: m.saved_title(),
          run: () => void navigate({ to: "/app", search: { panel: "saved" } }),
        },
        {
          value: `${m.spot_add()} new spot place marker`,
          label: m.spot_add(),
          run: () => void navigate({ to: "/app", search: { panel: "add" } }),
        },
        {
          value: `${m.alerts_title()} alerts notifications`,
          label: m.alerts_title(),
          run: () => void navigate({ to: "/app", search: { panel: "alerts" } }),
        },
        {
          value: `${m.command_alerts_mine()} alerts spots conditions`,
          label: m.command_alerts_mine(),
          run: () => void navigate({ to: "/app", search: { panel: "alerts", alerts: "mine" } }),
        },
        {
          value: `${m.command_alerts_settings()} alerts settings preferences hours`,
          label: m.command_alerts_settings(),
          run: () =>
            void navigate({ to: "/app", search: { panel: "account", settings: "alerts" } }),
        },
        {
          value: `${m.sessions_title()} sessions logbook log journal carnet recap`,
          label: m.sessions_title(),
          run: () =>
            void navigate({ to: "/app", search: { panel: "account", settings: "sessions" } }),
        },
        {
          value: `${m.contributions_title()} contributions guides community rank score points`,
          label: m.contributions_title(),
          run: () =>
            void navigate({ to: "/app", search: { panel: "account", settings: "contributions" } }),
        },
        {
          value: `${m.friends_title()} friends link invite sponsor parrain amis`,
          label: m.friends_title(),
          run: () =>
            void navigate({ to: "/app", search: { panel: "account", settings: "friends" } }),
        },
        {
          value: `${m.account_settings()} settings account preferences ${m.units_title()} units knots nœuds km/h feet pieds celsius fahrenheit`,
          label: m.account_settings(),
          run: () => void navigate({ to: "/app", search: { panel: "account" } }),
        },
        ...(analyticsConfigured
          ? [
              {
                value: `${m.analytics_title()} posthog privacy statistics errors`,
                label: m.analytics_title(),
                run: () => void navigate({ to: "/app", search: { panel: "account" } }),
              },
            ]
          : []),
        {
          value: `${m.terms_title()} terms conditions cgu legal`,
          label: m.terms_title(),
          run: () => void navigate({ to: "/terms" }),
        },
        {
          value: `${m.privacy_title()} privacy gdpr rgpd confidentialité data données`,
          label: m.privacy_title(),
          run: () => void navigate({ to: "/privacy" }),
        },
        {
          value: `${m.legal_title()} legal notice mentions légales publisher host éditeur hébergeur`,
          label: m.legal_title(),
          run: () => void navigate({ to: "/legal" }),
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
    // The account's lists, each shown alone on the map: a list is found by typing its name.
    ...(lists.length > 0
      ? [
          {
            value: "lists",
            label: m.command_group_lists(),
            items: lists.map((list) => ({
              value: `${list.isDefault ? m.saved_favorites() : list.name} list liste ${list.id}`,
              label: list.isDefault ? m.saved_favorites() : list.name,
              run: () => void navigate({ to: "/app", search: { list: list.id, panel: "saved" } }),
            })),
          },
        ]
      : []),
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
        // Each other language, said in itself, and the shortcut on the one it goes on to.
        ...locales
          .filter((locale) => locale !== getLocale())
          .map((locale) => ({
            value: `${m.shortcut_switch_locale()} language ${LANGUAGES[locale]} ${m.command_switch_locale({}, { locale })}`,
            label: m.command_switch_locale({}, { locale }),
            ...(locale === nextLocale() && { hotkey: bindings["switch-locale"] }),
            run: () => void setLocale(locale),
          })),
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
