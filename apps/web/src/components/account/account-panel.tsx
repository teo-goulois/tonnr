import { Button } from "@repo/ui/components/ui/button";
import { Tabs, TabsList, TabsTab } from "@repo/ui/components/ui/tabs";
import { ChevronRightIcon, LogOutIcon } from "@repo/ui/icon";
import { useTheme } from "next-themes";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";

import { openShortcutSettings } from "@/components/shared/shortcut-settings";
import { UnitsSettings } from "@/components/shared/units-settings";
import { AccountPrompt } from "@/components/viewer/saved-panel";
import { m } from "@/paraglide/messages.js";
import { getLocale, locales, setLocale } from "@/paraglide/runtime.js";

import { points } from "../guides/contributions-panel";
import { RANKS } from "../guides/guide-words";
import { RankBadge } from "../guides/rank";
import type { Standing } from "../viewer/types";
import { UsernameForm } from "./username-form";

type AccountPanelProps = {
  // The account that is signed in. Undefined for a visitor, who still has settings: the units,
  // the theme and the language are kept by the browser.
  // `username` is what others read of it: null for an account that has chosen none yet, and
  // undefined while the API has not said.
  account: { name: string; email: string; username?: string | null } | undefined;
  // Gives the account a username, and answers why it was refused or nothing once it is kept.
  onUsernameSave: (username: string) => Promise<string | undefined>;
  // Given when the account's address is not checked yet, on an instance that checks addresses.
  check?: { isSending: boolean; onSend: () => void };
  onSignIn: () => void;
  onCreateAccount: () => void;
  onSignOut: () => void;
  // Opens how the account wants to be told of its alerts, one step into this panel.
  onOpenAlertSettings: () => void;
  // Where the account stands in the guides, once the API has said. Decision 041.
  standing?: Pick<Standing, "score" | "rank"> | undefined;
  // Opens what the account wrote in the guides, one step into this panel.
  onOpenContributions: () => void;
  // How many friends the account has, once the API has said.
  friendCount?: number | undefined;
  // Opens the account's link and its friends, one step into this panel.
  onOpenFriends: () => void;
};

// A language is named in itself, whatever language the screen is read in.
const LANGUAGES: Record<(typeof locales)[number], string> = { en: "English", fr: "Français" };

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-s">
      <h2 className="text-s font-medium text-neutral-7">{title}</h2>
      {children}
    </section>
  );
}

/** A setting on a line: its name, and what chooses it. Too narrow, the choice goes under. */
function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-s gap-y-xxs">
      <span>{label}</span>
      {children}
    </div>
  );
}

/**
 * The account and its settings: who is signed in, the units, how to be told of the alerts, the
 * theme and the language. A phone opens it from its bar of tabs and a wide screen from the
 * account's menu. Decision 040.
 */
export function AccountPanel({
  account,
  check,
  onUsernameSave,
  onSignIn,
  onCreateAccount,
  onSignOut,
  onOpenAlertSettings,
  standing,
  onOpenContributions,
  friendCount,
  onOpenFriends,
}: AccountPanelProps) {
  const { theme, setTheme } = useTheme();
  const [isNaming, setNaming] = useState(false);

  return (
    <div className="grid gap-l">
      {account ? (
        <div className="grid justify-items-start gap-xxs">
          {/* An account is called by its username once it has one, with the rank it reached. */}
          <p className="flex max-w-full items-center gap-xs font-medium">
            <span className="truncate">
              {account.username ? `@${account.username}` : account.name}
            </span>
            {standing?.rank && <RankBadge rank={standing.rank} />}
          </p>
          <p className="max-w-full truncate text-s text-neutral-7">{account.email}</p>
          {account.username !== undefined &&
            (isNaming ? (
              <div className="mt-xs w-full">
                <UsernameForm
                  current={account.username}
                  onSave={onUsernameSave}
                  onSaved={(username) => {
                    setNaming(false);
                    toast.success(m.username_saved({ username }));
                  }}
                  onCancel={() => setNaming(false)}
                />
              </div>
            ) : (
              <div className="mt-xs grid justify-items-start gap-xs">
                {account.username === null && <p className="text-s">{m.username_none()}</p>}
                <Button variant="secondary" size="sm" onClick={() => setNaming(true)}>
                  {account.username === null ? m.username_choose() : m.username_change()}
                </Button>
              </div>
            ))}
          {check && (
            <div className="mt-xs grid justify-items-start gap-xs">
              <p className="text-s">{m.verify_not_checked()}</p>
              <Button
                variant="secondary"
                size="sm"
                isPending={check.isSending}
                onClick={check.onSend}
              >
                {m.verify_send_again()}
              </Button>
            </div>
          )}
        </div>
      ) : (
        <AccountPrompt
          text={m.account_sign_in_prompt()}
          onSignIn={onSignIn}
          onCreateAccount={onCreateAccount}
        />
      )}

      {/* What the account wrote in the guides of the spots, and where it stands. */}
      {account && (
        <Section title={m.community_title()}>
          <button
            type="button"
            className="focus-ring -mx-xs flex min-h-11 cursor-pointer items-center justify-between gap-s rounded-(--radius-xs) px-xs text-left outline-none hover:bg-neutral-3-transparent"
            onClick={onOpenContributions}
          >
            <span className="grid gap-xxs">
              <span>{m.contributions_title()}</span>
              <span className="text-s text-neutral-7">
                {standing && standing.score > 0
                  ? [points(standing.score), standing.rank && RANKS[standing.rank].name()]
                      .filter(Boolean)
                      .join(" · ")
                  : m.contributions_hint()}
              </span>
            </span>
            <ChevronRightIcon data-slot="icon" aria-hidden className="shrink-0 text-neutral-7" />
          </button>
          <button
            type="button"
            className="focus-ring -mx-xs flex min-h-11 cursor-pointer items-center justify-between gap-s rounded-(--radius-xs) px-xs text-left outline-none hover:bg-neutral-3-transparent"
            onClick={onOpenFriends}
          >
            <span className="grid gap-xxs">
              <span>{m.friends_title()}</span>
              <span className="text-s text-neutral-7">
                {friendCount === undefined || friendCount === 0
                  ? m.friends_hint()
                  : friendCount === 1
                    ? m.friends_count_one()
                    : m.friends_count({ count: friendCount })}
              </span>
            </span>
            <ChevronRightIcon data-slot="icon" aria-hidden className="shrink-0 text-neutral-7" />
          </button>
        </Section>
      )}

      {/* The units every measurement is written in, on every screen. Decision 033. */}
      <Section title={m.units_title()}>
        <UnitsSettings />
      </Section>

      {account && (
        <Section title={m.alerts_title()}>
          <button
            type="button"
            className="focus-ring -mx-xs flex min-h-11 cursor-pointer items-center justify-between gap-s rounded-(--radius-xs) px-xs text-left outline-none hover:bg-neutral-3-transparent"
            onClick={onOpenAlertSettings}
          >
            <span className="grid gap-xxs">
              <span>{m.command_alerts_settings()}</span>
              <span className="text-s text-neutral-7">{m.account_alerts_hint()}</span>
            </span>
            <ChevronRightIcon data-slot="icon" aria-hidden className="shrink-0 text-neutral-7" />
          </button>
        </Section>
      )}

      <Section title={m.account_display()}>
        <Line label={m.account_theme()}>
          {/* The theme is the browser's to know: none is in view before it has said. */}
          <Tabs value={theme ?? null} onValueChange={(next) => setTheme(String(next))}>
            <TabsList variant="segment" aria-label={m.account_theme()}>
              <TabsTab value="system">{m.account_theme_system()}</TabsTab>
              <TabsTab value="light">{m.account_theme_light()}</TabsTab>
              <TabsTab value="dark">{m.account_theme_dark()}</TabsTab>
            </TabsList>
          </Tabs>
        </Line>
        <Line label={m.account_language()}>
          <Tabs
            value={getLocale()}
            onValueChange={(next) => void setLocale(next as (typeof locales)[number])}
          >
            <TabsList variant="segment" aria-label={m.account_language()}>
              {locales.map((locale) => (
                <TabsTab key={locale} value={locale}>
                  {LANGUAGES[locale]}
                </TabsTab>
              ))}
            </TabsList>
          </Tabs>
        </Line>
        {/* Shortcuts are a keyboard's: a phone's bar of tabs does not lead to them. */}
        <div className="max-lg:hidden">
          <Button variant="secondary" size="sm" onClick={openShortcutSettings}>
            {m.shortcuts_title()}
          </Button>
        </div>
      </Section>

      {account && (
        <div>
          <Button variant="outline" onClick={onSignOut}>
            <LogOutIcon data-slot="icon" aria-hidden />
            {m.auth_sign_out()}
          </Button>
        </div>
      )}
    </div>
  );
}
