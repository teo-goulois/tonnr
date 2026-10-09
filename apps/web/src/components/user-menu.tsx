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
import { MailIcon, LogOutIcon, UserIcon } from "@repo/ui/icon";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { authClient } from "@/lib/auth-client";
import { m } from "@/paraglide/messages.js";

type UserMenuProps = {
  name: string;
  email: string;
  // Given when the account's address is not checked yet, on an instance that checks addresses.
  check?: { isSending: boolean; onSend: () => void };
};

export default function UserMenu({ name, email, check }: UserMenuProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

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
        {check && (
          <MenuItem disabled={check.isSending} onClick={check.onSend}>
            <MailIcon aria-hidden />
            {m.verify_send_again()}
          </MenuItem>
        )}
        <MenuItem
          onClick={() =>
            void authClient.signOut({
              fetchOptions: {
                // What was loaded for the account must not outlive the session, and the
                // product's pages take one: the visitor goes back to the landing page.
                onSuccess: () => {
                  queryClient.clear();
                  void navigate({ to: "/" });
                },
              },
            })
          }
        >
          <LogOutIcon aria-hidden />
          {m.auth_sign_out()}
        </MenuItem>
      </MenuPopup>
    </Menu>
  );
}
