import { Button } from "@repo/ui/components/ui/button";
import { useAppForm } from "@repo/ui/hooks/form/form";
import { z } from "zod";

import { m } from "@/paraglide/messages.js";

// A name as the API takes it.
const NAME_MOST = 80;

/** A spot being renamed or moved: its name as the editor opened, and where its marker stands. */
export type SpotEdit = {
  id: string;
  name: string;
  point: { latitude: number; longitude: number };
};

type SpotEditorProps = {
  edit: SpotEdit;
  isSaving: boolean;
  // The name as it was written, and the marker where it stands then.
  onSave: (name: string) => void;
  onCancel: () => void;
};

/** What a spot's name must be, said in the reader's language: the panel that adds one says it too. */
export const spotNameSchema = () => z.string().trim().min(1, m.spot_name_missing());

/**
 * Renaming a spot and moving it. The map beside the panel shows its marker, takes the presses
 * that put it elsewhere, and lets it be dragged, as when the spot was added. The form holds the
 * name, which is typed here: the marker is the map's.
 */
export function SpotEditor({ edit, isSaving, onSave, onCancel }: SpotEditorProps) {
  const form = useAppForm({
    defaultValues: { name: edit.name },
    validators: { onSubmit: z.object({ name: spotNameSchema() }) },
    onSubmit: ({ value }) => {
      if (!isSaving) onSave(value.name.trim());
    },
  });

  return (
    <form.AppForm>
      <form.Form className="grid gap-m">
        <form.AppField name="name">
          {(field) => (
            <field.Input
              label={m.spot_name_label()}
              maxLength={NAME_MOST}
              autoComplete="off"
              disabled={isSaving}
            />
          )}
        </form.AppField>
        <div className="grid gap-xxs">
          <p className="text-s text-neutral-7">{m.spot_marker_hint()}</p>
          <p className="text-xs text-neutral-7 tabular-nums">
            {edit.point.latitude.toFixed(5)}, {edit.point.longitude.toFixed(5)}
          </p>
        </div>
        <div className="flex flex-wrap gap-xs">
          <form.SubmitButton isPending={isSaving}>{m.spot_edit_save()}</form.SubmitButton>
          <Button type="button" variant="ghost" disabled={isSaving} onClick={onCancel}>
            {m.action_cancel()}
          </Button>
        </div>
      </form.Form>
    </form.AppForm>
  );
}
