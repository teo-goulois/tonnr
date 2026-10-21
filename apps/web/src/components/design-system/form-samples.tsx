import { ToggleGroupItem } from "@repo/ui/components/ui/toggle-group";
import { useAppForm } from "@repo/ui/hooks/form/form";
import { useEffect, useState } from "react";
import { z } from "zod";

import { RatingInput } from "@/components/sessions/rating";

// The form kit of decision 076, with invented fields: each adapter, its description, its error,
// and the button that sends. The second form was sent empty as it opened, to show what a field
// says when it is wrong.

const WORDS = ["beach", "reef", "point"] as const;

const schema = z.object({
  name: z.string().trim().min(1, "Give the spot a name."),
  email: z.email("Enter a valid email address."),
  note: z.string().max(200, "Keep it under 200 characters."),
  bottom: z.array(z.string()).min(1, "Choose at least one."),
  rating: z
    .number()
    .nullable()
    .refine((rating) => rating !== null, "Rate the session."),
});

type Values = z.input<typeof schema>;

const EMPTY: Values = { name: "", email: "", note: "", bottom: [], rating: null };

function SampleForm({ sentAtOnce = false }: { sentAtOnce?: boolean }) {
  const [said, setSaid] = useState<string>();
  const form = useAppForm({
    defaultValues: EMPTY,
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      await new Promise((resolve) => window.setTimeout(resolve, 700));
      setSaid(`Saved ${value.name}.`);
    },
  });

  useEffect(() => {
    if (sentAtOnce) void form.handleSubmit();
  }, [form, sentAtOnce]);

  return (
    <form.AppForm>
      <form.Form className="grid max-w-sm gap-m">
        <form.AppField name="name">
          {(field) => (
            <field.Input
              label="Spot name"
              placeholder="La Torche"
              autoComplete="off"
              description="The name only you will read."
            />
          )}
        </form.AppField>
        <form.AppField name="email">
          {(field) => <field.Input label="Email" type="email" autoComplete="email" />}
        </form.AppField>
        <form.AppField name="note">
          {(field) => <field.Textarea label="Note" rows={2} placeholder="A few words" />}
        </form.AppField>
        <form.AppField name="bottom">
          {(field) => (
            <field.Choice label="Bottom" multiple>
              {WORDS.map((word) => (
                <ToggleGroupItem key={word} value={word}>
                  {word}
                </ToggleGroupItem>
              ))}
            </field.Choice>
          )}
        </form.AppField>
        <form.AppField name="rating">
          {(field) => (
            <field.Control<number | null> label="Rating" layout="inline">
              {(control) => (
                <RatingInput label="Rating" value={control.value} onChange={control.onChange} />
              )}
            </field.Control>
          )}
        </form.AppField>
        <div className="flex items-center gap-s">
          <form.SubmitButton pendingContent="Saving…">Save</form.SubmitButton>
          {said ? (
            <p role="status" className="text-s text-neutral-7">
              {said}
            </p>
          ) : null}
        </div>
      </form.Form>
    </form.AppForm>
  );
}

export function FormSamples() {
  return (
    <div className="grid gap-l lg:grid-cols-2">
      <SampleForm />
      <SampleForm sentAtOnce />
    </div>
  );
}
