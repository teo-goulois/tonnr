import { Button } from "@repo/ui/components/ui/button";
import { Dialog, DialogPopup, DialogTitle } from "@repo/ui/components/ui/dialog";
import { useAppForm } from "@repo/ui/hooks/form/form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";

import type { Developer } from "@/lib/api";
import { m } from "@/paraglide/messages.js";
import { client, refreshLists } from "@/utils/orpc";

// What the admin proposes for a new account: decision 020.
const PROPOSED_LIMIT = "100";

type DeveloperFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // The account to change. Without one, the form creates an account.
  developer?: Developer;
  onSaved?: (developer: Developer) => void;
};

/** Creates a developer account, or changes one: its name, its contact, a note, and its limit. */
export function DeveloperFormDialog(props: DeveloperFormDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogPopup className="w-full max-w-md gap-l p-l">
        <DialogTitle>{props.developer ? m.developer_edit() : m.developer_new()}</DialogTitle>
        {/* The form lives while the dialog is open, so it starts from the account as it is now. */}
        <DeveloperForm {...props} />
      </DialogPopup>
    </Dialog>
  );
}

function DeveloperForm({ onOpenChange, developer, onSaved }: DeveloperFormDialogProps) {
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: (values: {
      name: string;
      contact: string;
      note: string;
      callsPerHour: number | null;
    }) =>
      developer
        ? client.v1.developers.update({ id: developer.id, ...values })
        : client.v1.developers.create(values),
    onSuccess: async (saved) => {
      await refreshLists(queryClient);
      onOpenChange(false);
      onSaved?.(saved);
    },
    onError: (error) => toast.error(error.message),
  });

  const form = useAppForm({
    defaultValues: {
      name: developer?.name ?? "",
      contact: developer?.contact ?? "",
      note: developer?.note ?? "",
      // Empty for no limit.
      limit: developer ? (developer.callsPerHour?.toString() ?? "") : PROPOSED_LIMIT,
    },
    onSubmit: async ({ value }) => {
      const { limit, ...values } = value;
      await save
        .mutateAsync({ ...values, callsPerHour: limit.trim() === "" ? null : Number(limit) })
        // The mutation said what went wrong.
        .catch(() => {});
    },
    validators: {
      onSubmit: z.object({
        name: z.string().trim().min(1, m.developer_name_missing()).max(80, m.too_long()),
        contact: z.string().trim().max(200, m.too_long()),
        note: z.string().trim().max(1000, m.too_long()),
        limit: z
          .string()
          .trim()
          .regex(/^([1-9][0-9]{0,5})?$/, m.developer_limit_invalid()),
      }),
    },
  });

  return (
    <form.AppForm>
      <form.Form className="flex flex-col gap-m">
        <form.AppField name="name">
          {(field) => <field.Input label={m.developer_name()} autoComplete="off" autoFocus />}
        </form.AppField>
        <form.AppField name="contact">
          {(field) => (
            <field.Input
              label={m.developer_contact()}
              description={m.developer_contact_hint()}
              autoComplete="off"
            />
          )}
        </form.AppField>
        <form.AppField name="limit">
          {(field) => (
            <field.Input
              label={m.developer_limit()}
              description={m.developer_limit_hint()}
              inputMode="numeric"
              autoComplete="off"
            />
          )}
        </form.AppField>
        <form.AppField name="note">
          {(field) => <field.Textarea label={m.developer_note()} rows={3} />}
        </form.AppField>

        <div className="flex justify-end gap-xs">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {m.cancel()}
          </Button>
          <form.SubmitButton>{developer ? m.save() : m.developer_create()}</form.SubmitButton>
        </div>
      </form.Form>
    </form.AppForm>
  );
}
