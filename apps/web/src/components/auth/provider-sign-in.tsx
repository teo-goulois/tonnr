import { Button } from "@repo/ui/components/ui/button";
import { AppleIcon, GoogleIcon } from "@repo/ui/icon";
import { cn } from "@repo/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { type ComponentProps, useRef, useState } from "react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";
import { type Provider, PROVIDERS, providerErrorURL, providerReturnURL } from "@/lib/provider-auth";
import { m } from "@/paraglide/messages.js";

// Apple's rules for its button: its own words and its mark in one color, on black where the page
// is light and on white where it is dark, and no other colors.
// https://developer.apple.com/design/human-interface-guidelines/sign-in-with-apple
const APPLE_LOOK = cn(
  "bg-black text-white [--edge-color:black]",
  "hover:bg-black/80 aria-expanded:bg-black/80",
  "dark:bg-white dark:text-black dark:[--edge-color:white]",
  "dark:hover:bg-white/85 dark:aria-expanded:bg-white/85",
  // The theme's dimmed words of a button that waits, which the dark look would otherwise cover.
  "dark:disabled:text-neutral-6",
);

/** The button of one provider, in the words and the look its rules ask for. */
export function ProviderButton({
  provider,
  className,
  ...props
}: { provider: Provider } & Omit<ComponentProps<typeof Button>, "children" | "variant">) {
  return provider === "apple" ? (
    <Button variant="outline" className={cn(APPLE_LOOK, className)} {...props}>
      <AppleIcon data-slot="icon" aria-hidden />
      {m.auth_apple()}
    </Button>
  ) : (
    <Button variant="outline" className={className} {...props}>
      <GoogleIcon data-slot="icon" aria-hidden />
      {m.auth_google()}
    </Button>
  );
}

/**
 * A button for each provider the instance offers, Apple's first, over the address and the
 * password. The API says which, and an older API that names Google alone shows Google's alone.
 */
export function ProviderSignIn({
  invitation,
  returnTo,
  disabled,
  onPendingChange,
}: {
  invitation?: string | undefined;
  returnTo?: string | undefined;
  disabled: boolean;
  onPendingChange: (pending: boolean) => void;
}) {
  const [pending, setPending] = useState<Provider | null>(null);
  const sending = useRef(false);
  const providers = useQuery({
    queryKey: ["auth", "sign-in-providers"],
    queryFn: async () => {
      const answer =
        await authClient.$fetch<Partial<Record<Provider, boolean>>>("/sign-in-providers");
      if (answer.error) throw new Error("Sign-in providers could not be read");
      return answer.data;
    },
    staleTime: 60_000,
    retry: false,
    meta: { quiet: true },
  });

  async function signIn(provider: Provider) {
    if (sending.current) return;
    sending.current = true;
    setPending(provider);
    onPendingChange(true);
    try {
      const current = returnTo
        ? new URL(returnTo, window.location.origin).href
        : window.location.href;
      const answer = await authClient.signIn.social({
        provider,
        callbackURL: providerReturnURL(current),
        errorCallbackURL: providerErrorURL(current, provider),
        ...(invitation && { additionalData: { invitation } }),
      });
      if (!answer.error) return;
      toast.error(m.auth_failed());
    } catch {
      toast.error(m.auth_failed());
    }
    sending.current = false;
    setPending(null);
    onPendingChange(false);
  }

  const offered = PROVIDERS.filter((provider) => providers.data?.[provider] === true);
  if (offered.length === 0) return null;
  return (
    <>
      {offered.map((provider) => (
        <ProviderButton
          key={provider}
          provider={provider}
          disabled={disabled || (pending !== null && pending !== provider)}
          isPending={pending === provider}
          onClick={() => void signIn(provider)}
        />
      ))}
      <div className="flex items-center gap-s text-s text-neutral-7">
        <span className="h-px flex-1 bg-neutral-4" aria-hidden />
        {m.auth_or()}
        <span className="h-px flex-1 bg-neutral-4" aria-hidden />
      </div>
    </>
  );
}
