import { Button } from "@repo/ui/components/ui/button";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "@repo/ui/components/ui/menu";
import { MailIcon, LogOutIcon, SettingsIcon, UserIcon } from "@repo/ui/icon";
import { useNavigate } from "@tanstack/react-router";

import { useSignOut } from "@/components/auth/use-sign-out";
import { Username } from "@/components/guides/rank";
import type { Rank } from "@/components/viewer/types";
import { m } from "@/paraglide/messages.js";

type UserMenuProps = {
  name: string;
  // What others read of the account. An account that has chosen none is called by its name.
  username: string | null | undefined;
  rank: Rank | null | undefined;
  email: string;
  // Given when the account's address is not checked yet, on an instance that checks addresses.
  check?: { isSending: boolean; onSend: () => void };
};

export default function UserMenu({ name, username, rank, email, check }: UserMenuProps) {
  const navigate = useNavigate();
  const signOut = useSignOut();

  return (
    <Menu>
      <MenuTrigger render={<Button variant="ghost" size="icon" aria-label={m.account_menu()} />}>
        <UserIcon data-slot="icon" aria-hidden />
      </MenuTrigger>
      <MenuPopup align="end" className="min-w-56">
        <MenuGroup>
          <MenuGroupLabel className="grid">
            {username ? (
              <Username name={username} rank={rank} className="text-neutral-10" />
            ) : (
              <span className="truncate text-neutral-10">{name}</span>
            )}
            <span className="truncate font-normal">{email}</span>
            {check && <span className="font-normal">{m.verify_not_checked()}</span>}
          </MenuGroupLabel>
        </MenuGroup>
        <MenuSeparator />
        {/* The account's panel, with its settings: the units, the alerts, the theme. */}
        <MenuItem
          onClick={() =>
            void navigate({
              to: "/app",
              search: (previous) => ({
                ...previous,
                panel: "account" as const,
                settings: undefined,
              }),
            })
          }
        >
          <SettingsIcon aria-hidden />
          {m.account_settings()}
        </MenuItem>
        <MenuSeparator />
        {check && (
          <MenuItem disabled={check.isSending} onClick={check.onSend}>
            <MailIcon aria-hidden />
            {m.verify_send_again()}
          </MenuItem>
        )}
        <MenuItem onClick={signOut}>
          <LogOutIcon aria-hidden />
          {m.auth_sign_out()}
        </MenuItem>
      </MenuPopup>
    </Menu>
  );
}
