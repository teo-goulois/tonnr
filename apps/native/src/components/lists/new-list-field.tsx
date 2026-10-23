import { PlusIcon } from "@repo/ui/icon";
import { type ComponentRef, type RefObject, useRef } from "react";
import { type TextInput, View } from "react-native";
import { z } from "zod";

import { IconButton } from "@/components/ui/button";
import { useAppForm, useFormSend, useSelector } from "@/components/ui/form";
import { feel } from "@/components/ui/haptics";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

/** As long as a list's name may be: the API takes sixty characters. */
export const NAME_MOST = 60;

/** What a list's name must be, as the web's `listNameSchema` says it. */
const listNameSchema = () => z.string().trim().min(1, m.saved_list_name_missing()).max(NAME_MOST);

function useNewListForm(onCreate: (name: string) => Promise<unknown>, onMade: () => void) {
  return useAppForm({
    defaultValues: { name: "" },
    validators: { onSubmit: z.object({ name: listNameSchema() }) },
    onSubmit: async ({ value, formApi }) => {
      try {
        await onCreate(value.name.trim());
      } catch {
        // What failed was told: what was typed stays, to be sent again.
        return;
      }
      feel("done");
      formApi.reset();
      onMade();
    },
  });
}

function NewListFields({
  form,
  creating,
  input,
}: {
  form: ReturnType<typeof useNewListForm>;
  creating: boolean;
  input: RefObject<ComponentRef<typeof TextInput> | null>;
}) {
  const { space } = useTheme();
  const send = useFormSend();
  const isSubmitting = useSelector(form.store, (state) => state.isSubmitting);
  // A list is made once: the keyboard's key waits while it is, as the button does.
  const busy = creating || isSubmitting;
  return (
    // The button stands at the field's height, beside it, whatever is said under the field.
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.xs }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <form.AppField name="name">
          {(field) => (
            <field.Input
              ref={input}
              placeholder={m.saved_new_list()}
              accessibilityLabel={m.saved_new_list()}
              maxLength={NAME_MOST}
              autoCapitalize="sentences"
              returnKeyType="done"
              // The keyboard stays while a name left empty is said under the field.
              submitBehavior="submit"
              onSubmitEditing={() => {
                if (!busy) void send();
              }}
            />
          )}
        </form.AppField>
      </View>
      <IconButton
        icon={PlusIcon}
        label={m.saved_create_list()}
        variant="secondary"
        onPress={() => void send()}
        loading={busy}
      />
    </View>
  );
}

/**
 * A new list, named where it is made, as the web's `NewListForm`: the last part of the saved tab,
 * a field and the round button that makes the list, which the keyboard's own key does too. A name
 * left empty is said under the field once sent, which keeps the keyboard, and the button is never
 * held still for it (decision 076); the field stays as it is while the list is made, as the web's.
 * What was typed goes once the list is made, with the keyboard, and stays when it could not be.
 */
export function NewListField({
  onCreate,
  creating,
}: {
  onCreate: (name: string) => Promise<unknown>;
  creating: boolean;
}) {
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const form = useNewListForm(onCreate, () => input.current?.blur());
  return (
    <form.AppForm>
      <NewListFields form={form} creating={creating} input={input} />
    </form.AppForm>
  );
}
