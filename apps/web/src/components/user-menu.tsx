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
import { LogOutIcon, UserIcon } from "@repo/ui/icon";
import { useQueryClient } from "@tanstack/react-query";

import { authClient } from "@/lib/auth-client";
import { m } from "@/paraglide/messages.js";

export default function UserMenu({ name, email }: { name: string; email: string }) {
  const queryClient = useQueryClient();

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
          </MenuGroupLabel>
        </MenuGroup>
        <MenuSeparator />
        <MenuItem
          onClick={() =>
            void authClient.signOut({
              fetchOptions: {
                // What was loaded for the account must not outlive the session.
                onSuccess: () => queryClient.clear(),
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
