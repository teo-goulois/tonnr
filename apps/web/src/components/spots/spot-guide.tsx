import { Button } from "@repo/ui/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/ui/toggle-group";
import { useEffect, useId, useRef, useState } from "react";

import { m } from "@/paraglide/messages.js";

import { CHARACTERISTIC_FIELDS, CharacteristicsList } from "../viewer/break-characteristics";
import type { Spot } from "../viewer/types";

/** What is said of a spot: each characteristic, null where nothing is said. */
export type SpotDescription = Spot["characteristics"];

type SpotGuideProps = {
  spot: Spot;
  // True while the owner is describing the spot.
  isEditing: boolean;
  onEditingChange: (editing: boolean) => void;
  isSaving: boolean;
  onSave: (said: SpotDescription) => void;
};

/**
 * What its owner says a spot is like, for the tab beside its forecast: read as a break's is, and
 * written by pressing the words that apply. Nothing is required, and nothing of it is the
 * catalogue's.
 */
export function SpotGuide({ spot, isEditing, onEditingChange, isSaving, onSave }: SpotGuideProps) {
  const hasSome = Object.values(spot.characteristics).some((value) => value !== null);
  // The keyboard follows what it was on: into the form when it opens, and back to the button
  // that opens it when it closes.
  const opener = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(isEditing);
  useEffect(() => {
    if (wasEditing.current && !isEditing) opener.current?.focus();
    wasEditing.current = isEditing;
  }, [isEditing]);

  if (isEditing) {
    return (
      <SpotGuideForm
        saved={spot.characteristics}
        isSaving={isSaving}
        onSave={onSave}
        onCancel={() => onEditingChange(false)}
      />
    );
  }
  return (
    <div className="grid justify-items-start gap-m">
      {hasSome ? (
        <CharacteristicsList known={spot.characteristics} title={m.spot_guide_title()} />
      ) : (
        <p className="text-s text-neutral-7">
          {spot.isOwner ? m.spot_guide_invite() : m.details_guide_empty()}
        </p>
      )}
      {spot.isOwner && (
        <Button ref={opener} variant="secondary" size="sm" onClick={() => onEditingChange(true)}>
          {hasSome ? m.spot_guide_edit() : m.spot_guide_describe()}
        </Button>
      )}
    </div>
  );
}

function SpotGuideForm({
  saved,
  isSaving,
  onSave,
  onCancel,
}: {
  saved: SpotDescription;
  isSaving: boolean;
  onSave: (said: SpotDescription) => void;
  onCancel: () => void;
}) {
  const id = useId();
  // What was pressed here, characteristic by characteristic. The rest is what the spot holds,
  // now: a characteristic left alone follows the spot if it changes elsewhere meanwhile, and so
  // does what this form does not ask for.
  const [changed, setChanged] = useState<Partial<SpotDescription>>({});
  const said = { ...saved, ...changed };
  // The form takes the keyboard when it opens.
  const top = useRef<HTMLParagraphElement>(null);
  useEffect(() => top.current?.focus(), []);

  return (
    <form
      className="grid gap-l"
      aria-labelledby={`${id}-hint`}
      onSubmit={(event) => {
        event.preventDefault();
        if (!isSaving) onSave(said);
      }}
    >
      <p ref={top} id={`${id}-hint`} tabIndex={-1} className="text-s text-neutral-7 outline-none">
        {m.spot_guide_hint()}
      </p>
      {CHARACTERISTIC_FIELDS.map((field) => (
        <div key={field.key} className="grid gap-xs">
          <p id={`${id}-${field.key}`} className="text-s font-medium">
            {field.label()}
          </p>
          <ToggleGroup
            multiple
            variant="outline"
            size="sm"
            aria-labelledby={`${id}-${field.key}`}
            disabled={isSaving}
            value={said[field.key] ?? []}
            onValueChange={(pressed) =>
              // A characteristic with nothing pressed is one that is not said. Each press adds
              // to what the others left, however close together they come.
              setChanged((current) => ({
                ...current,
                [field.key]: pressed.length > 0 ? pressed : null,
              }))
            }
          >
            {field.words.map(({ word, reading }) => (
              <ToggleGroupItem key={word} value={word}>
                {reading()}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      ))}
      <div className="flex flex-wrap gap-xs">
        <Button type="submit" isPending={isSaving}>
          {m.spot_guide_save()}
        </Button>
        <Button type="button" variant="ghost" disabled={isSaving} onClick={onCancel}>
          {m.action_cancel()}
        </Button>
      </div>
    </form>
  );
}
