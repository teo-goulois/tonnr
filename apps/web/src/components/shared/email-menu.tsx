import { CONTACT_EMAIL } from "@repo/config/app";
import { AnimatedIconSwap } from "@repo/ui/components/ui/animated-icon-swap";
import { Menu, MenuItem, MenuLinkItem, MenuPopup, MenuTrigger } from "@repo/ui/components/ui/menu";
import {
  CheckIcon,
  CopyIcon,
  EnvelopeFillIcon,
  GmailIcon,
  OutlookIcon,
  YahooIcon,
} from "@repo/ui/icon";
import { cn } from "@repo/ui/lib/utils";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { m } from "@/paraglide/messages.js";

const ENCODED = encodeURIComponent(CONTACT_EMAIL);

// The mail apps a reader may write from, each opened on a new mail to the address.
const WEBMAILS = [
  {
    name: "Gmail",
    icon: GmailIcon,
    href: `https://mail.google.com/mail/?view=cm&fs=1&to=${ENCODED}`,
  },
  {
    name: "Outlook",
    icon: OutlookIcon,
    href: `https://outlook.live.com/mail/0/deeplink/compose?to=${ENCODED}`,
  },
  { name: "Yahoo Mail", icon: YahooIcon, href: `https://compose.mail.yahoo.com/?to=${ENCODED}` },
];

// A brand's mark stays grey until its row is pointed at.
const logo =
  "size-4 shrink-0 grayscale transition-[filter] duration-(--motion-duration) group-data-highlighted/row:grayscale-0";

// How long the row says the address was copied before the menu closes.
const COPIED_MS = 800;

/**
 * The address to write to, which opens the ways to write from: the device's own mail app, a
 * webmail, or the address copied. As Téo's own site offers it.
 */
export function EmailMenu({ children, className }: { children?: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const closing = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (closing.current) clearTimeout(closing.current);
    },
    [],
  );

  function copy() {
    if (!navigator.clipboard) {
      toast.error(m.email_menu_copy_failed());
      return;
    }
    void navigator.clipboard
      .writeText(CONTACT_EMAIL)
      .then(() => {
        setCopied(true);
        if (closing.current) clearTimeout(closing.current);
        closing.current = setTimeout(() => setOpen(false), COPIED_MS);
      })
      .catch(() => toast.error(m.email_menu_copy_failed()));
  }

  return (
    <Menu
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setCopied(false);
      }}
    >
      <MenuTrigger
        className={cn(
          "focus-ring cursor-pointer rounded-xs underline decoration-neutral-5 underline-offset-4 transition-[text-decoration-color] duration-(--motion-duration) hover:decoration-neutral-10",
          className,
        )}
      >
        {children ?? CONTACT_EMAIL}
      </MenuTrigger>
      <MenuPopup align="start" side="bottom" sideOffset={8} aria-label={m.email_menu_label()}>
        <MenuLinkItem href={`mailto:${CONTACT_EMAIL}`} className="group/row gap-xs">
          <EnvelopeFillIcon aria-hidden className="size-4 shrink-0" />
          {m.email_menu_default()}
        </MenuLinkItem>
        {WEBMAILS.map(({ name, icon: Icon, href }) => (
          <MenuLinkItem
            key={name}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="group/row gap-xs"
          >
            <Icon aria-hidden className={logo} />
            {name}
          </MenuLinkItem>
        ))}
        <MenuItem
          closeOnClick={false}
          onClick={copy}
          aria-label={copied ? m.email_menu_copied() : m.email_menu_copy()}
          className="group/row gap-xs"
        >
          <AnimatedIconSwap activeKey={copied ? "check" : "copy"} className="size-4 shrink-0">
            {copied ? (
              <CheckIcon aria-hidden className="size-4 text-success" />
            ) : (
              <CopyIcon aria-hidden className="size-4" />
            )}
          </AnimatedIconSwap>
          {CONTACT_EMAIL}
        </MenuItem>
      </MenuPopup>
    </Menu>
  );
}
