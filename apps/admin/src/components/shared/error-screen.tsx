import { Button } from "@repo/ui/components/ui/button";
import { type ErrorComponentProps, useRouter } from "@tanstack/react-router";

import { ENV } from "@/env.public";
import { m } from "@/paraglide/messages.js";
import { ApiUnreachableError } from "@/utils/orpc";

/**
 * What a screen shows when it could not load. When the API did not answer at all, it says the
 * two addresses that have to agree: an API answers this app only when its `ADMIN_ORIGIN` names
 * where the app runs, and a browser hides every other reason behind the same failure.
 */
export function ErrorScreen({ error }: ErrorComponentProps) {
  const router = useRouter();
  // Only a browser calls the API, so only a browser can say where this app runs.
  const unreachable = error instanceof ApiUnreachableError && typeof window !== "undefined";

  return (
    <main className="mx-auto grid w-full max-w-(--container-xl) content-start justify-items-start gap-m px-m py-xl">
      <h1 className="text-l font-medium">{m.error_title()}</h1>
      {unreachable ? (
        <p className="text-neutral-7">
          {m.error_unreachable({ api: ENV.VITE_SERVER_URL, origin: window.location.origin })}
        </p>
      ) : (
        error instanceof Error && <p className="text-neutral-7">{error.message}</p>
      )}
      <Button variant="outline" onClick={() => void router.invalidate()}>
        {m.retry()}
      </Button>
    </main>
  );
}
