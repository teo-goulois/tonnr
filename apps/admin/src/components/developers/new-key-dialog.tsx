import { Button } from "@repo/ui/components/ui/button";
import { Dialog, DialogDescription, DialogPopup, DialogTitle } from "@repo/ui/components/ui/dialog";
import { useAppForm } from "@repo/ui/hooks/form/form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { CopyButton } from "@/components/shared/copy-button";
import type { MadeKey } from "@/lib/api";
import { m } from "@/paraglide/messages.js";
import { client, refreshLists } from "@/utils/orpc";

type NewKeyDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  developer: { id: string; name: string };
};

/**
 * Makes a key for a developer account, then shows it. The instance keeps only the key's hash,
 * so this is the one time it can be read.
 */
export function NewKeyDialog({ open, onOpenChange, developer }: NewKeyDialogProps) {
  // While a key is being made, and while it is on screen, the dialog closes by its own button
  // alone. Escape or a click beside it would lose the one sight of the key.
  const [held, setHeld] = useState(false);

  return (
    <Dialog open={open} onOpenChange={(next) => (next || !held) && onOpenChange(next)}>
      <DialogPopup className="w-full max-w-md gap-l p-l">
        {/* It lives while the dialog is open: a key is not kept on screen once it is closed. */}
        <NewKey
          developer={developer}
          onHeld={setHeld}
          onDone={() => {
            setHeld(false);
            onOpenChange(false);
          }}
        />
      </DialogPopup>
    </Dialog>
  );
}

type NewKeyProps = Pick<NewKeyDialogProps, "developer"> & {
  // Told while the dialog must stay open: a key is on its way, or on screen.
  onHeld: (held: boolean) => void;
  onDone: () => void;
};

function NewKey({ developer, onHeld, onDone }: NewKeyProps) {
  const queryClient = useQueryClient();
  const [made, setMade] = useState<MadeKey | null>(null);
  const make = useMutation({
    mutationFn: (name: string) => client.v1.keys.create({ name, developerId: developer.id }),
    // The answer holds the key: it is dropped with the dialog, not kept for later.
    gcTime: 0,
    onSuccess: async (key) => {
      setMade(key);
      await refreshLists(queryClient);
    },
    onError: (error) => toast.error(error.message),
  });

  const held = make.isPending || made !== null;
  useEffect(() => onHeld(held), [held, onHeld]);

  const form = useAppForm({
    defaultValues: { name: "" },
    onSubmit: async ({ value }) => {
      // The mutation says what went wrong.
      await make.mutateAsync(value.name).catch(() => {});
    },
    validators: {
      onSubmit: z.object({
        name: z.string().trim().min(1, m.key_name_missing()).max(80, m.too_long()),
      }),
    },
  });

  if (made) {
    return (
      <>
        <div className="grid gap-xs">
          <DialogTitle>{m.key_made_title()}</DialogTitle>
          <DialogDescription>{m.key_made_body({ name: made.name })}</DialogDescription>
        </div>
        <div className="flex items-center gap-xs rounded-(--radius-xs) bg-neutral-2 py-xs pr-xs pl-s">
          <code className="min-w-0 flex-1 font-mono text-s break-all select-all">{made.key}</code>
          <CopyButton text={made.key} label={m.key_copy()} />
        </div>
        <div className="flex justify-end">
          <Button onClick={onDone}>{m.key_made_done()}</Button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="grid gap-xs">
        <DialogTitle>{m.key_new()}</DialogTitle>
        <DialogDescription>{m.key_new_body({ developer: developer.name })}</DialogDescription>
      </div>
      <form.AppForm>
        <form.Form className="flex flex-col gap-m">
          <form.AppField name="name">
            {(field) => (
              <field.Input
                label={m.key_name()}
                description={m.key_name_hint()}
                autoComplete="off"
                autoFocus
              />
            )}
          </form.AppField>
          <div className="flex justify-end gap-xs">
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <Button type="button" variant="ghost" disabled={isSubmitting} onClick={onDone}>
                  {m.cancel()}
                </Button>
              )}
            </form.Subscribe>
            <form.SubmitButton>{m.key_make()}</form.SubmitButton>
          </div>
        </form.Form>
      </form.AppForm>
    </>
  );
}
