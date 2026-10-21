import { Button } from "@repo/ui/components/ui/button";
import { useAppForm } from "@repo/ui/hooks/form/form";
import { z } from "zod";

import { m } from "@/paraglide/messages.js";

// A reason as the API takes it.
const REASON_MOST = 280;

type ReasonFormProps = {
  // While the refusal is on its way.
  isPending: boolean;
  // Sends the reason, as it was typed and without its spaces around it.
  onRefuse: (reason: string) => Promise<unknown>;
  onCancel: () => void;
};

/**
 * Why an operator refuses what was asked, which its author reads: a spot to make public, or
 * what an account wrote of a break. The form lives while its dialog is open, so each refusal
 * starts with nothing written.
 */
export function ReasonForm({ isPending, onRefuse, onCancel }: ReasonFormProps) {
  const form = useAppForm({
    defaultValues: { reason: "" },
    onSubmit: async ({ value }) => {
      // The mutation says what went wrong.
      await onRefuse(value.reason.trim()).catch(() => {});
    },
    validators: {
      onSubmit: z.object({
        reason: z
          .string()
          .trim()
          .min(1, m.moderation_reason_missing())
          .max(REASON_MOST, m.too_long()),
      }),
    },
  });

  return (
    <form.AppForm>
      <form.Form className="grid gap-l">
        <form.AppField name="reason">
          {(field) => (
            <field.Textarea
              label={m.moderation_reason()}
              maxLength={REASON_MOST}
              rows={2}
              disabled={isPending}
            />
          )}
        </form.AppField>
        <div className="flex justify-end gap-xs">
          <Button type="button" variant="ghost" onClick={onCancel}>
            {m.cancel()}
          </Button>
          <form.SubmitButton isPending={isPending}>{m.moderation_refuse()}</form.SubmitButton>
        </div>
      </form.Form>
    </form.AppForm>
  );
}
