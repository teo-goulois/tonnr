import { Input } from "@repo/ui/components/ui/input";
import { Textarea } from "@repo/ui/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/ui/toggle-group";

import { Field } from "@/components/shared/field";
import type { BreakCharacteristics, BreakValues, OperatorBreak } from "@/lib/api";
import { m } from "@/paraglide/messages.js";

import { inOrder, LINES, LIST_LINES, type ListLine, readLine } from "./words";

// The longest description the API takes.
export const DESCRIPTION_MOST = 600;

export type DescriptionLanguage = "en" | "fr";

/** What an operator is writing of a break: numbers as they are typed. */
export type BreakDraft = {
  name: string;
  latitude: string;
  longitude: string;
  characteristics: BreakCharacteristics;
  // The size it works at, in meters, as it is typed: `characteristics` holds it as it was read.
  size: { min: string; max: string };
  description: string;
  language: DescriptionLanguage;
};

/** The size a break works at, as a draft types it. */
export function sizeDraftOf(characteristics: BreakCharacteristics) {
  const size = characteristics.waveSizeMeters;
  return { min: size?.min?.toString() ?? "", max: size?.max?.toString() ?? "" };
}

export function draftOf(
  values: {
    name: string;
    latitude: number;
    longitude: number;
    characteristics: BreakCharacteristics;
    description: OperatorBreak["description"];
  },
  language: DescriptionLanguage,
): BreakDraft {
  return {
    name: values.name,
    // As stored: a break saved for its name keeps its point to the last decimal.
    latitude: String(values.latitude),
    longitude: String(values.longitude),
    characteristics: values.characteristics,
    size: sizeDraftOf(values.characteristics),
    description: values.description?.text ?? "",
    language: values.description?.language ?? language,
  };
}

const isNumber = (text: string, least: number, most: number) =>
  /^-?\d+(\.\d+)?$/.test(text.trim()) && Number(text) >= least && Number(text) <= most;

/** The point a draft says, or null while what is typed is not one. */
export function pointOfDraft(draft: { latitude: string; longitude: string }) {
  return isNumber(draft.latitude, -90, 90) && isNumber(draft.longitude, -180, 180)
    ? { latitude: Number(draft.latitude), longitude: Number(draft.longitude) }
    : null;
}

// The most a bound of a size may be, in meters, as the API takes it.
const SIZE_MOST = 30;

/** The size a draft says, null when it says none, or undefined while what is typed is not one. */
function sizeOfDraft({ min, max }: BreakDraft["size"]) {
  const bound = (typed: string) =>
    typed.trim() === "" ? null : isNumber(typed, 0, SIZE_MOST) ? Number(typed) : undefined;
  const least = bound(min);
  const most = bound(max);
  if (least === undefined || most === undefined) return undefined;
  if (least === null && most === null) return null;
  if (least !== null && most !== null && least > most) return undefined;
  return { min: least, max: most };
}

/** What is wrong with a draft, by field, or nothing. */
export function faultsOf(draft: BreakDraft) {
  const faults: Partial<Record<"name" | "point" | "size" | "description", string>> = {};
  if (draft.name.trim() === "") faults.name = m.catalogue_fault_name();
  if (!isNumber(draft.latitude, -90, 90) || !isNumber(draft.longitude, -180, 180)) {
    faults.point = m.catalogue_fault_point();
  }
  if (sizeOfDraft(draft.size) === undefined) {
    faults.size = m.catalogue_fault_size({ most: SIZE_MOST });
  }
  const text = draft.description.trim();
  if (text !== "" && (text.length < 3 || text.length > DESCRIPTION_MOST)) {
    faults.description = m.catalogue_fault_description({ most: DESCRIPTION_MOST });
  }
  return faults;
}

/** A draft as the API takes it. Call it once `faultsOf` finds nothing. */
export function valuesOf(draft: BreakDraft): BreakValues {
  const text = draft.description.trim();
  return {
    name: draft.name.trim(),
    latitude: Number(draft.latitude),
    longitude: Number(draft.longitude),
    characteristics: { ...draft.characteristics, waveSizeMeters: sizeOfDraft(draft.size) ?? null },
    description: text === "" ? null : { text, language: draft.language },
  };
}

type BreakFieldsProps = {
  draft: BreakDraft;
  onChange: (draft: BreakDraft) => void;
  // What accounts confirmed of the break, which the guide shows over the catalogue's words.
  confirmed?: Partial<BreakCharacteristics>;
  // What to read beside the description while it is written, such as a list's own text.
  descriptionHint?: string;
};

/** The name, the point, what a break is like and its description, as an operator writes them. */
export function BreakFields({
  draft,
  onChange,
  confirmed = {},
  descriptionHint,
}: BreakFieldsProps) {
  const faults = faultsOf(draft);
  const set = (change: Partial<BreakDraft>) => onChange({ ...draft, ...change });
  const setLine = (line: ListLine, words: string[]) =>
    set({
      characteristics: {
        ...draft.characteristics,
        [line]: words.length > 0 ? inOrder(line, words) : null,
      },
    });

  return (
    <div className="grid gap-m">
      <Field label={m.catalogue_name()} errors={[{ message: faults.name }]}>
        {(invalid) => (
          <Input
            value={draft.name}
            aria-invalid={invalid || undefined}
            onChange={(event) => set({ name: event.target.value })}
          />
        )}
      </Field>

      <div className="grid gap-xxs">
        <div className="grid grid-cols-2 gap-xs">
          <Field label={m.catalogue_latitude()}>
            {(invalid) => (
              <Input
                inputMode="decimal"
                value={draft.latitude}
                aria-invalid={invalid || Boolean(faults.point) || undefined}
                onChange={(event) => set({ latitude: event.target.value })}
              />
            )}
          </Field>
          <Field label={m.catalogue_longitude()}>
            {(invalid) => (
              <Input
                inputMode="decimal"
                value={draft.longitude}
                aria-invalid={invalid || Boolean(faults.point) || undefined}
                onChange={(event) => set({ longitude: event.target.value })}
              />
            )}
          </Field>
        </div>
        {faults.point ? (
          <span role="alert" className="text-s text-error">
            {faults.point}
          </span>
        ) : (
          <span className="text-s text-neutral-7">{m.catalogue_point_hint()}</span>
        )}
      </div>

      {LIST_LINES.map((line) => {
        const said = draft.characteristics[line] ?? [];
        const over = readLine(line, confirmed[line] as string[] | null | undefined);
        return (
          <fieldset key={line} className="grid gap-xxs">
            <legend className="mb-xxs font-medium">{LINES[line].label()}</legend>
            <ToggleGroup
              multiple
              size="sm"
              variant="outline"
              value={[...said]}
              onValueChange={(words) => setLine(line, words as string[])}
            >
              {Object.entries(LINES[line].words as Record<string, () => string>).map(
                ([word, read]) => (
                  <ToggleGroupItem key={word} value={word}>
                    {read()}
                  </ToggleGroupItem>
                ),
              )}
            </ToggleGroup>
            {over && (
              <span className="text-s text-neutral-7">
                {m.catalogue_confirmed({ words: over })}
              </span>
            )}
          </fieldset>
        );
      })}

      <Field label={m.moderation_said_offshore()} hint={m.catalogue_offshore_hint()}>
        {(invalid) => (
          <Input
            inputMode="numeric"
            className="max-w-32"
            value={draft.characteristics.offshoreDirectionDegrees?.toString() ?? ""}
            aria-invalid={invalid || undefined}
            onChange={(event) => {
              const typed = event.target.value.trim();
              const degrees = Number(typed);
              set({
                characteristics: {
                  ...draft.characteristics,
                  offshoreDirectionDegrees:
                    typed !== "" && Number.isInteger(degrees) && degrees >= 0 && degrees < 360
                      ? degrees
                      : null,
                },
              });
            }}
          />
        )}
      </Field>

      <fieldset className="grid gap-xxs">
        <legend className="mb-xxs font-medium">{m.catalogue_size()}</legend>
        <div className="grid max-w-80 grid-cols-2 gap-xs">
          <Field label={m.catalogue_size_min()}>
            {(invalid) => (
              <Input
                inputMode="decimal"
                value={draft.size.min}
                aria-invalid={invalid || Boolean(faults.size) || undefined}
                onChange={(event) => set({ size: { ...draft.size, min: event.target.value } })}
              />
            )}
          </Field>
          <Field label={m.catalogue_size_max()}>
            {(invalid) => (
              <Input
                inputMode="decimal"
                value={draft.size.max}
                aria-invalid={invalid || Boolean(faults.size) || undefined}
                onChange={(event) => set({ size: { ...draft.size, max: event.target.value } })}
              />
            )}
          </Field>
        </div>
        {faults.size ? (
          <span role="alert" className="text-s text-error">
            {faults.size}
          </span>
        ) : (
          <span className="text-s text-neutral-7">{m.catalogue_size_hint()}</span>
        )}
      </fieldset>

      <div className="grid gap-xxs">
        <Field
          label={m.catalogue_description()}
          hint={descriptionHint ?? m.catalogue_description_hint()}
          errors={[{ message: faults.description }]}
        >
          {(invalid) => (
            <Textarea
              rows={4}
              lang={draft.language}
              value={draft.description}
              aria-invalid={invalid || undefined}
              onChange={(event) => set({ description: event.target.value })}
            />
          )}
        </Field>
        <div className="flex flex-wrap items-center justify-between gap-xs">
          <ToggleGroup
            size="sm"
            variant="outline"
            aria-label={m.catalogue_description_language()}
            value={[draft.language]}
            onValueChange={(chosen) => {
              const [language] = chosen as DescriptionLanguage[];
              if (language) set({ language });
            }}
          >
            <ToggleGroupItem value="fr">{m.catalogue_language_fr()}</ToggleGroupItem>
            <ToggleGroupItem value="en">{m.catalogue_language_en()}</ToggleGroupItem>
          </ToggleGroup>
          <span className="text-s text-neutral-7 tabular-nums">
            {draft.description.trim().length} / {DESCRIPTION_MOST}
          </span>
        </div>
      </div>
    </div>
  );
}
