import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";

import { authClient } from "@/lib/auth-client";

// PROTOTYPE: the door of a demo. When the development server is started with an invented account
// in `VITE_DEMO_EMAIL` and `VITE_DEMO_PASSWORD`, this page signs it in and opens an alert at a
// surf break of the French coast, on a variant of the prototype. Without them it does nothing.
const email = import.meta.env.VITE_DEMO_EMAIL as string | undefined;
const password = import.meta.env.VITE_DEMO_PASSWORD as string | undefined;
const BREAK = import.meta.env.VITE_DEMO_BREAK as string | undefined;

export const Route = createFileRoute("/demo")({
  validateSearch: z.object({
    v: z.enum(["a", "b", "c", "d"]).optional().catch(undefined),
    or: z.coerce.string().pipe(z.enum(["1", "2", "3"])).optional().catch(undefined),
  }),
  ssr: false,
  component: Demo,
});

function Demo() {
  const { v, or } = Route.useSearch();
  const isOpen = import.meta.env.DEV && Boolean(email) && Boolean(password) && Boolean(BREAK);
  const [hasFailed, setHasFailed] = useState(false);

  useEffect(() => {
    if (!isOpen || !email || !password) return;
    void authClient.signIn.email({ email, password }).then((result) => {
      if (result.error) setHasFailed(true);
      else
        window.location.replace(
          `/app?break=${BREAK}&create=alert&proto=${v ?? "d"}&or=${or ?? "1"}`,
        );
    });
  }, [isOpen, v, or]);

  return (
    <p className="p-l text-s text-neutral-7">
      {!isOpen
        ? "No demo here."
        : hasFailed
          ? "The demo could not be opened."
          : "Opening the demo…"}
    </p>
  );
}
