import type { ReactNode } from "react";

import { NavLink, Shell } from "@/components/shared/admin-shell";
import { ConsoleHotkeys } from "@/components/shared/admin-hotkeys";
import { ConsolePalette } from "@/components/shared/command-palette";
import { ShortcutSettings } from "@/components/shared/shortcut-settings";
import { m } from "@/paraglide/messages.js";

type ConsoleShellProps = {
  account: { name: string; email: string };
  // The developer accounts the reader is a member of.
  developers: { id: string; name: string }[];
  children: ReactNode;
};

/**
 * The admin of an account that runs nothing and reads the developer accounts it is a member
 * of: decision 027. None of an operator's pages, commands or shortcuts is mounted here.
 */
export function ConsoleShell({ account, developers, children }: ConsoleShellProps) {
  return (
    <Shell
      account={account}
      home="/console"
      // A member of one developer account has one screen, and no list to go back to.
      nav={
        developers.length > 1 ? (
          <NavLink to="/console" exact>
            {m.nav_developers()}
          </NavLink>
        ) : undefined
      }
      commands={
        <>
          <ConsoleHotkeys />
          <ConsolePalette developers={developers} />
          <ShortcutSettings forConsole />
        </>
      }
    >
      {children}
    </Shell>
  );
}
