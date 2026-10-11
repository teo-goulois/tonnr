import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";

import { authClient } from "@/lib/auth-client";

// PROTOTYPE: the door of a demo. When the web server of development is started with an invented
// account in `VITE_DEMO_EMAIL` and `VITE_DEMO_PASSWORD`, this page signs that account in and
// goes on to a variant of the spot editor, so that whoever is shown the prototype on a phone has
// nothing to type. Without them it does nothing. See components/viewer/spot-editor-prototype.
const email = import.meta.env.VITE_DEMO_EMAIL as string | undefined;
const password = import.meta.env.VITE_DEMO_PASSWORD as string | undefined;
// A point at sea for the editor to open on, so that the first screen has a forecast to show.
const AT = "47.81305,-5.52879";

export const Route = createFileRoute("/demo")({
  // The variant is one of three, and the page goes nowhere else: its address is anyone's to write.
  validateSearch: z.object({ v: z.enum(["a", "b", "c"]).optional().catch(undefined) }),
  ssr: false,
  component: Demo,
});

function Demo() {
  const { v } = Route.useSearch();
  const isOpen = import.meta.env.DEV && Boolean(email) && Boolean(password);
  const [hasFailed, setHasFailed] = useState(false);

  useEffect(() => {
    if (!isOpen || !email || !password) return;
    void authClient.signIn.email({ email, password }).then((result) => {
      if (result.error) setHasFailed(true);
      else window.location.replace(`/app?spot=${v ?? "a"}&at=${AT}`);
    });
  }, [isOpen, v]);

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
