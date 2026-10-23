import type { Spot } from "@repo/client/viewer/types";
import { type ComponentRef, useEffect, useRef, useState } from "react";
import { View } from "react-native";

import { usePlaceRecord } from "@/components/place/use-place";
import { useSpotActions } from "@/components/place/use-spot";
import { Button } from "@/components/ui/button";
import { focusForReader, useAppForm, useStore } from "@/components/ui/form";
import { useSheetGuard } from "@/components/ui/sheet";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

import { GuideSkeleton } from "./break-guide";
import { CHARACTERISTIC_FIELDS } from "./characteristic-words";
import { onDescribeAsked, takeDescribeAsk } from "./describing";
import { CharacteristicsList, listedRows, measuredRows, useSizeReading } from "./characteristics";
import { sameWords } from "./guide-words";

// What its owner says a spot is like, the tab of a spot's sheet beside its forecast, as the web's
// `SpotGuide` reads and writes it: read as a break's is, and written by pressing the words that
// apply, in the tab itself, which becomes the form while it is written. Nothing is required, and
// nothing of it is the catalogue's. A spot read in a shared list is read and never written.
// While words other than the spot's are pressed, the place's sheet asks before it is left, as a
// form sheet does (decision 078). Decisions 006 and 041.

/** What is said of a spot: each characteristic, null where nothing is said. */
type Said = Spot["characteristics"];

/**
 * The lists a form says otherwise than the spot does, in whatever order, each as it is saved: a
 * list with nothing pressed is one that is not said.
 */
function changedOf(pressed: Said, saved: Said): Partial<Said> {
  return Object.fromEntries(
    CHARACTERISTIC_FIELDS.flatMap(({ key }) => {
      const words = pressed[key];
      const said = words && words.length > 0 ? words : null;
      return sameWords(said ?? [], saved[key] ?? []) ? [] : [[key, said]];
    }),
  );
}

/** What a spot is like, and what lets its owner describe it. */
export function SpotGuide({ id }: { id: string }) {
  const { space } = useTheme();
  const record = usePlaceRecord("spot", id);
  const spots = useSpotActions();
  // True while the owner is describing the spot.
  const [isEditing, setIsEditing] = useState(false);
  const spot = record.spot;
  const size = useSizeReading(spot?.characteristics.waveSizeMeters ?? null);
  // The offer a spot just added makes its owner turns this tab into what describes it, once the
  // spot is read, as the web's panel opens its editor.
  const latest = useRef(spot);
  latest.current = spot;
  const isOwner = spot?.isOwner ?? false;
  useEffect(() => {
    if (!isOwner) return;
    const answer = () => {
      if (latest.current && takeDescribeAsk(id)) setIsEditing(true);
    };
    answer();
    return onDescribeAsked(answer);
  }, [id, isOwner]);

  // A spot that is gone, or someone else's, is said so by the sheet's head.
  if (!spot) return record.isError ? null : <GuideSkeleton />;

  if (isEditing && spot.isOwner) {
    return (
      <SpotGuideForm
        saved={spot.characteristics}
        isSaving={spots.isChanging}
        onSave={(said) => spots.describe(spot, said, () => setIsEditing(false))}
        onCancel={() => setIsEditing(false)}
      />
    );
  }

  // Whatever the spot says, as the web asks it: what is said is listed, and is edited.
  const hasSome = Object.values(spot.characteristics).some((value) => value !== null);
  const rows = [...listedRows(spot.characteristics), ...measuredRows(spot.characteristics, size)];
  return (
    <View style={{ gap: space.m }}>
      {hasSome ? (
        <CharacteristicsList title={m.spot_guide_title()} rows={rows} />
      ) : (
        <Text size="s" tone="muted">
          {spot.isOwner ? m.spot_guide_invite() : m.details_guide_empty()}
        </Text>
      )}
      {spot.isOwner ? (
        <Button
          variant="secondary"
          onPress={() => setIsEditing(true)}
          style={{ alignSelf: "flex-start" }}
        >
          {hasSome ? m.spot_guide_edit() : m.spot_guide_describe()}
        </Button>
      ) : null}
    </View>
  );
}

/**
 * The words that apply to a spot, one group for each list, saved together, as the web's
 * `SpotGuideForm`. What was pressed here is what the form changed; the rest is what the spot
 * holds now, which follows it if it changes elsewhere meanwhile, and so does what this form does
 * not ask for. Its Save is never greyed: with nothing changed, it folds the form away.
 */
function SpotGuideForm({
  saved,
  isSaving,
  onSave,
  onCancel,
}: {
  saved: Said;
  isSaving: boolean;
  onSave: (said: Said) => void;
  onCancel: () => void;
}) {
  const { space } = useTheme();
  const form = useAppForm({
    defaultValues: saved,
    onSubmit: ({ value }) => {
      if (isSaving) return;
      // A word pressed and pressed again changes nothing.
      const changed = changedOf(value, saved);
      if (Object.keys(changed).length === 0) onCancel();
      else onSave({ ...saved, ...changed });
    },
  });
  const isHeld = useStore(
    form.store,
    (state) => Object.keys(changedOf(state.values, saved)).length > 0,
  );
  useSheetGuard(isHeld);
  // A list left alone follows the spot.
  useEffect(() => {
    for (const { key } of CHARACTERISTIC_FIELDS) {
      if (form.getFieldMeta(key)?.isDirty) continue;
      form.setFieldValue(key, saved[key], { dontUpdateMeta: true, dontRunListeners: true });
    }
  }, [form, saved]);
  // A screen reader begins the form at what it asks, as the web's form takes the keyboard there.
  const top = useRef<ComponentRef<typeof View>>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => focusForReader(top.current));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <form.AppForm>
      <View style={{ gap: space.l }}>
        <View ref={top} accessible>
          <Text size="s" tone="muted">
            {m.spot_guide_hint()}
          </Text>
        </View>
        {CHARACTERISTIC_FIELDS.map((characteristic) => (
          <form.AppField key={characteristic.key} name={characteristic.key}>
            {(field) => (
              <field.Choice
                label={characteristic.label()}
                multiple
                disabled={isSaving}
                options={characteristic.words.map(({ word, reading }) => ({
                  value: word,
                  label: reading(),
                }))}
              />
            )}
          </form.AppField>
        ))}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
          <form.SubmitButton pending={isSaving}>{m.spot_guide_save()}</form.SubmitButton>
          <Button variant="ghost" disabled={isSaving} onPress={onCancel}>
            {m.action_cancel()}
          </Button>
        </View>
      </View>
    </form.AppForm>
  );
}
