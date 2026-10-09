import { buttonVariants } from "@repo/ui/components/ui/button";
import { Link } from "@tanstack/react-router";

import { m } from "@/paraglide/messages.js";

export function NotFound() {
  return (
    <main className="mx-auto grid w-full max-w-(--container-sm) content-start justify-items-start gap-m px-m py-xl">
      <h1 className="text-l font-medium">{m.not_found_title()}</h1>
      <Link to="/" className={buttonVariants({ variant: "outline" })}>
        {m.not_found_back()}
      </Link>
    </main>
  );
}
