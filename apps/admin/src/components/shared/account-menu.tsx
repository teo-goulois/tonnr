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
import { useNavigate } from "@tanstack/react-router";

import { authClient } from "@/lib/auth-client";
import { m } from "@/paraglide/messages.js";
import { getLocale, setLocale } from "@/paraglide/runtime.js";

/** Signs the account out. What was loaded for it must not outlive its session. */
export function useSignOut() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return () =>
    void authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          queryClient.clear();
          void navigate({ to: "/login" });
        },
      },
    });
}

export function AccountMenu({ name, email }: { name: string; email: string }) {
  const signOut = useSignOut();
  const otherLocale = getLocale() === "fr" ? "en" : "fr";

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
        <MenuItem lang={otherLocale} onClick={() => void setLocale(otherLocale)}>
          {m.switch_locale()}
        </MenuItem>
        <MenuItem onClick={signOut}>
          <LogOutIcon aria-hidden />
          {m.auth_sign_out()}
        </MenuItem>
      </MenuPopup>
    </Menu>
  );
}
