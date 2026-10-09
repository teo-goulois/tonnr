import { Button } from "@repo/ui/components/ui/button";
import { type ErrorComponentProps, useRouter } from "@tanstack/react-router";

import { m } from "@/paraglide/messages.js";

/** What a screen shows when it could not load, with the reason the API gave. */
export function ErrorScreen({ error }: ErrorComponentProps) {
  const router = useRouter();

  return (
    <main className="mx-auto grid w-full max-w-(--container-xl) content-start justify-items-start gap-m px-m py-xl">
      <h1 className="text-l font-medium">{m.error_title()}</h1>
      {error instanceof Error && <p className="text-neutral-7">{error.message}</p>}
      <Button variant="outline" onClick={() => void router.invalidate()}>
        {m.retry()}
      </Button>
    </main>
  );
}
