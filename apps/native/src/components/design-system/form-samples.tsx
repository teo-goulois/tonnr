import { useEffect, useState } from "react";
import { View } from "react-native";
import { z } from "zod";

import { RatingInput } from "@/components/sessions/rating";
import { useAppForm } from "@/components/ui/form";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/lib/theme";

// The form kit of decisions 076 and 078, with invented fields, as the web's design system shows
// it: each adapter, its description, its fault, and the button that sends, which waits while the
// form is sent. The second form was sent empty as it opened, to show what a field says when it is
// wrong. A form sheet that holds one is the sheet the design system opens.

const WORDS = [
  { value: "beach", label: "beach" },
  { value: "reef", label: "reef" },
  { value: "point", label: "point" },
] as const;

export const sampleSchema = z.object({
  name: z.string().trim().min(1, "Give the spot a name."),
  email: z.email("Enter a valid email address."),
  note: z.string().max(200, "Keep it under 200 characters."),
  bottom: z.array(z.string()).min(1, "Choose at least one."),
  rating: z
    .number()
    .nullable()
    .refine((rating) => rating !== null, "Rate the session."),
});

export type SampleValues = z.input<typeof sampleSchema>;

export const EMPTY_SAMPLE: SampleValues = {
  name: "",
  email: "",
  note: "",
  bottom: [],
  rating: null,
};

/** The fields of the sample, inside a form made with `useAppForm`. */
export function SampleFields({ form }: { form: ReturnType<typeof useSampleForm> }) {
  return (
    <>
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
        {(field) => (
          <field.Input
            label="Email"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
        )}
      </form.AppField>
      <form.AppField name="note">
        {(field) => <field.Textarea label="Note" placeholder="A few words" />}
      </form.AppField>
      <form.AppField name="bottom">
        {(field) => <field.Choice label="Bottom" multiple options={WORDS} />}
      </form.AppField>
      <form.AppField name="rating">
        {(field) => (
          <field.Control<number | null> label="Rating" layout="inline">
            {(control) => (
              <RatingInput
                label={control.label ?? "Rating"}
                value={control.value}
                onChange={control.onChange}
              />
            )}
          </field.Control>
        )}
      </form.AppField>
    </>
  );
}

/** The sample's form, which says it saved once it waited a little. */
export function useSampleForm(onSaved: (name: string) => void) {
  return useAppForm({
    defaultValues: EMPTY_SAMPLE,
    validators: { onSubmit: sampleSchema },
    onSubmit: async ({ value }) => {
      await new Promise((resolve) => setTimeout(resolve, 700));
      onSaved(value.name);
    },
  });
}

function SampleForm({ sentAtOnce = false }: { sentAtOnce?: boolean }) {
  const { space } = useTheme();
  const [said, setSaid] = useState<string>();
  const form = useSampleForm((name) => setSaid(`Saved ${name}.`));

  useEffect(() => {
    if (sentAtOnce) void form.handleSubmit();
  }, [form, sentAtOnce]);

  return (
    <form.AppForm>
      <View style={{ gap: space.m }}>
        <SampleFields form={form} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.s }}>
          <form.SubmitButton>Save</form.SubmitButton>
          {said ? (
            <Text size="s" tone="muted" accessibilityLiveRegion="polite">
              {said}
            </Text>
          ) : null}
        </View>
      </View>
    </form.AppForm>
  );
}

export function FormSamples() {
  const { space } = useTheme();
  return (
    <View style={{ gap: space.xl }}>
      <SampleForm />
      <SampleForm sentAtOnce />
    </View>
  );
}
