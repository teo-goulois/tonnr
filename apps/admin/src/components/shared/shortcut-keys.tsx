import { Kbd } from "@repo/ui/components/ui/kbd";

import { shortcutTokens } from "@/lib/shortcuts";

// A shortcut as the keys to press. It renders nothing for a shortcut that is turned off.
export function ShortcutKeys({ hotkey, className }: { hotkey: string; className?: string }) {
  const tokens = shortcutTokens(hotkey);
  if (tokens.length === 0) return null;

  return (
    <span className={className}>
      <span className="flex items-center gap-xxs">
        {tokens.map((token) => (
          <Kbd key={token}>{token}</Kbd>
        ))}
      </span>
    </span>
  );
}
