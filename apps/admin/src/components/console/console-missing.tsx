import { buttonVariants } from "@repo/ui/components/ui/button";
import { Link } from "@tanstack/react-router";

import { m } from "@/paraglide/messages.js";

/**
 * What the console shows for a developer account the reader is no member of. The API answers
 * the same for one that does not exist, and so does this.
 */
export function ConsoleMissing() {
  return (
    <div className="grid content-start justify-items-start gap-m py-l">
      <h1 className="text-l font-medium">{m.console_missing_title()}</h1>
      <Link to="/console" className={buttonVariants({ variant: "outline" })}>
        {m.console_back()}
      </Link>
    </div>
  );
}
