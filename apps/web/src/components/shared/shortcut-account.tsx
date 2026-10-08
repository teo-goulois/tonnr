import { Button } from "@repo/ui/components/ui/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";
import { getShortcutOverrides, replaceShortcutOverrides } from "@/lib/shortcuts";
import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";
import { orpc } from "@/utils/orpc";

// Keeps a copy of the shortcuts in the account, and brings it back. Nothing moves on its own:
// each device keeps its shortcuts until the user presses one of the two buttons.
export function ShortcutAccount() {
  const { data: session } = authClient.useSession();
  const queryClient = useQueryClient();
  const saved = useQuery(orpc.preferences.getShortcuts.queryOptions({ enabled: Boolean(session) }));
  const save = useMutation(
    orpc.preferences.saveShortcuts.mutationOptions({
      onSuccess: (data) => {
        queryClient.setQueryData(orpc.preferences.getShortcuts.queryKey(), data);
        toast.success(m.shortcuts_account_saved_toast());
      },
      onError: () => toast.error(m.shortcuts_account_error()),
    }),
  );

  if (!session) return null;

  const savedAt = saved.data
    ? new Intl.DateTimeFormat(getLocale(), { dateStyle: "medium", timeStyle: "short" }).format(
        saved.data.savedAt,
      )
    : null;

  return (
    <section className="grid gap-s pt-l shadow-[inset_0_var(--border-s)_0_var(--neutral-4)]">
      <p className="text-neutral-7">
        {m.shortcuts_account_hint()}{" "}
        {saved.isPending
          ? null
          : savedAt
            ? m.shortcuts_account_saved_at({ date: savedAt })
            : m.shortcuts_account_empty()}
      </p>
      <div className="flex flex-wrap gap-xs">
        <Button
          variant="outline"
          size="sm"
          isPending={save.isPending}
          onClick={() => save.mutate({ overrides: getShortcutOverrides() })}
        >
          {m.shortcuts_account_save()}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={!saved.data}
          onClick={() => {
            if (!saved.data) return;
            replaceShortcutOverrides(saved.data.overrides);
            toast.success(m.shortcuts_account_restored_toast());
          }}
        >
          {m.shortcuts_account_restore()}
        </Button>
      </div>
    </section>
  );
}
