import { Button } from "@repo/ui/components/ui/button";
import { CheckIcon, CopyIcon } from "@repo/ui/icon";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { m } from "@/paraglide/messages.js";

/** Copies a text, and shows for a moment that it did. */
export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      onClick={() => {
        navigator.clipboard.writeText(text).then(
          () => setCopied(true),
          () => toast.error(m.copy_failed()),
        );
      }}
    >
      {copied ? (
        <CheckIcon data-slot="icon" aria-hidden />
      ) : (
        <CopyIcon data-slot="icon" aria-hidden />
      )}
    </Button>
  );
}
