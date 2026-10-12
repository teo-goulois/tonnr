import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { useId } from "react";

import { m } from "@/paraglide/messages.js";

// A name as the API takes it.
const NAME_MOST = 80;

/** A spot being renamed or moved: the name as it is typed, and where its marker stands. */
export type SpotEdit = {
  id: string;
  name: string;
  point: { latitude: number; longitude: number };
};

type SpotEditorProps = {
  edit: SpotEdit;
  onNameChange: (name: string) => void;
  isSaving: boolean;
  onSave: () => void;
  onCancel: () => void;
};

/**
 * Renaming a spot and moving it. The map beside the panel shows its marker, takes the presses
 * that put it elsewhere, and lets it be dragged, as when the spot was added.
 */
export function SpotEditor({ edit, onNameChange, isSaving, onSave, onCancel }: SpotEditorProps) {
  const nameId = useId();
  const name = edit.name.trim();

  return (
    <form
      className="grid gap-m"
      onSubmit={(event) => {
        event.preventDefault();
        if (name && !isSaving) onSave();
      }}
    >
      <div className="grid gap-xs">
        <Label htmlFor={nameId}>{m.spot_name_label()}</Label>
        <Input
          id={nameId}
          value={edit.name}
          maxLength={NAME_MOST}
          autoComplete="off"
          disabled={isSaving}
          onChange={(event) => onNameChange(event.target.value)}
        />
      </div>
      <div className="grid gap-xxs">
        <p className="text-s text-neutral-7">{m.spot_marker_hint()}</p>
        <p className="text-xs text-neutral-7 tabular-nums">
          {edit.point.latitude.toFixed(5)}, {edit.point.longitude.toFixed(5)}
        </p>
      </div>
      <div className="flex flex-wrap gap-xs">
        <Button type="submit" disabled={!name} isPending={isSaving}>
          {m.spot_edit_save()}
        </Button>
        <Button type="button" variant="ghost" disabled={isSaving} onClick={onCancel}>
          {m.action_cancel()}
        </Button>
      </div>
    </form>
  );
}
