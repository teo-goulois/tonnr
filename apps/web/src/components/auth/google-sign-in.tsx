import { Button } from "@repo/ui/components/ui/button";
import { GoogleIcon } from "@repo/ui/icon";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";
import { googleErrorURL, googleReturnURL } from "@/lib/google-auth";
import { m } from "@/paraglide/messages.js";

export function GoogleSignIn({
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
  const [pending, setPending] = useState(false);
  const sending = useRef(false);
  const providers = useQuery({
    queryKey: ["auth", "sign-in-providers"],
    queryFn: async () => {
      const answer = await authClient.$fetch<{ google: boolean }>("/sign-in-providers");
      if (answer.error) throw new Error("Sign-in providers could not be read");
      return answer.data;
    },
    staleTime: 60_000,
    retry: false,
    meta: { quiet: true },
  });

  async function signIn() {
    if (sending.current) return;
    sending.current = true;
    setPending(true);
    onPendingChange(true);
    try {
      const current = returnTo
        ? new URL(returnTo, window.location.origin).href
        : window.location.href;
      const answer = await authClient.signIn.social({
        provider: "google",
        callbackURL: googleReturnURL(current),
        errorCallbackURL: googleErrorURL(current),
        ...(invitation && { additionalData: { invitation } }),
      });
      if (!answer.error) return;
      toast.error(m.auth_failed());
    } catch {
      toast.error(m.auth_failed());
    }
    sending.current = false;
    setPending(false);
    onPendingChange(false);
  }

  if (!providers.data?.google) return null;
  return (
    <>
      <Button
        variant="outline"
        disabled={disabled}
        isPending={pending}
        onClick={() => void signIn()}
      >
        <GoogleIcon data-slot="icon" aria-hidden />
        {m.auth_google()}
      </Button>
      <div className="flex items-center gap-s text-s text-neutral-7">
        <span className="h-px flex-1 bg-neutral-4" aria-hidden />
        {m.auth_or()}
        <span className="h-px flex-1 bg-neutral-4" aria-hidden />
      </div>
    </>
  );
}
