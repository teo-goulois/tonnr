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
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { authClient } from "@/lib/auth-client";
import { leftPushHere } from "@/lib/push-here";
import { useUnits } from "@/lib/units";
import { leaveWith } from "@/lib/unsaved";
import { m } from "@/paraglide/messages.js";

import { openUnitsSettings, unitsInALine } from "./shared/units-settings";

type UserMenuProps = {
  name: string;
  email: string;
  // Given when the account's address is not checked yet, on an instance that checks addresses.
  check?: { isSending: boolean; onSend: () => void };
};

export default function UserMenu({ name, email, check }: UserMenuProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const units = useUnits();

  const signOut = async () => {
    const answer = await authClient.signOut().catch(() => null);
    // A sign-out that did not happen leaves everything as it was.
    if (!answer || answer.error) return;
    // The API forgot this browser's push with the session: the browser lets go of it too.
    await leftPushHere();
    // What was loaded for the account must not outlive the session: whoever signs out goes
    // back to the landing page. Whatever was unsaved was asked about before the session ended.
    queryClient.clear();
    void navigate({ to: "/", ignoreBlocker: true });
  };

  return (
    <Menu>
      <MenuTrigger render={<Button variant="ghost" size="icon" aria-label={m.account_menu()} />}>
        <UserIcon data-slot="icon" aria-hidden />
      </MenuTrigger>
      <MenuPopup align="end" className="min-w-56">
        <MenuGroup>
          <MenuGroupLabel className="grid">
            <span className="truncate text-neutral-10">{name}</span>
            <span className="truncate font-normal">{email}</span>
            {check && <span className="font-normal">{m.verify_not_checked()}</span>}
          </MenuGroupLabel>
        </MenuGroup>
        <MenuSeparator />
        {/* The units every measurement is written in, on every screen. Decision 033. */}
        <MenuItem onClick={openUnitsSettings}>
          <SettingsIcon aria-hidden />
          {m.units_title()}
          <span className="ml-auto text-neutral-7">{unitsInALine(units)}</span>
        </MenuItem>
        <MenuSeparator />
        {check && (
          <MenuItem disabled={check.isSending} onClick={check.onSend}>
            <MailIcon aria-hidden />
            {m.verify_send_again()}
          </MenuItem>
        )}
        <MenuItem
          // Something written and not saved is asked about before the session ends: once it
          // has, there is no staying.
          onClick={() => leaveWith(() => void signOut())}
        >
          <LogOutIcon aria-hidden />
          {m.auth_sign_out()}
        </MenuItem>
      </MenuPopup>
    </Menu>
  );
}
