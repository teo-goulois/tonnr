import { Button } from "@repo/ui/components/ui/button";
import { Dialog, DialogPopup, DialogTitle } from "@repo/ui/components/ui/dialog";
import { Input } from "@repo/ui/components/ui/input";
import { Textarea } from "@repo/ui/components/ui/textarea";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";

import { Field } from "@/components/shared/field";
import type { Developer } from "@/lib/api";
import { m } from "@/paraglide/messages.js";
import { client, orpc } from "@/utils/orpc";

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
      await queryClient.invalidateQueries({ queryKey: orpc.v1.developers.key() });
      onOpenChange(false);
      onSaved?.(saved);
    },
    onError: (error) => toast.error(error.message),
  });

  const form = useForm({
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
    <form
      noValidate
      className="flex flex-col gap-m"
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <form.Field name="name">
        {(field) => (
          <Field label={m.developer_name()} errors={field.state.meta.errors}>
            {(invalid) => (
              <Input
                name={field.name}
                autoComplete="off"
                autoFocus
                aria-invalid={invalid || undefined}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
              />
            )}
          </Field>
        )}
      </form.Field>
      <form.Field name="contact">
        {(field) => (
          <Field
            label={m.developer_contact()}
            hint={m.developer_contact_hint()}
            errors={field.state.meta.errors}
          >
            {(invalid) => (
              <Input
                name={field.name}
                autoComplete="off"
                aria-invalid={invalid || undefined}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
              />
            )}
          </Field>
        )}
      </form.Field>
      <form.Field name="limit">
        {(field) => (
          <Field
            label={m.developer_limit()}
            hint={m.developer_limit_hint()}
            errors={field.state.meta.errors}
          >
            {(invalid) => (
              <Input
                name={field.name}
                inputMode="numeric"
                autoComplete="off"
                aria-invalid={invalid || undefined}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
              />
            )}
          </Field>
        )}
      </form.Field>
      <form.Field name="note">
        {(field) => (
          <Field label={m.developer_note()} errors={field.state.meta.errors}>
            {(invalid) => (
              <Textarea
                name={field.name}
                rows={3}
                aria-invalid={invalid || undefined}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
              />
            )}
          </Field>
        )}
      </form.Field>

      <div className="flex justify-end gap-xs">
        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
          {m.cancel()}
        </Button>
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" isPending={isSubmitting}>
              {developer ? m.save() : m.developer_create()}
            </Button>
          )}
        </form.Subscribe>
      </div>
    </form>
  );
}
