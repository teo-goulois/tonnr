import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/ui/toggle-group";
import { useAppForm } from "@repo/ui/hooks/form/form";
import { useId } from "react";
import { z } from "zod";

import type { BreakCharacteristics, BreakValues, OperatorBreak } from "@/lib/api";
import { m } from "@/paraglide/messages.js";

import { inOrder, LINES, LIST_LINES, readLine } from "./words";

// The longest description the API takes.
export const DESCRIPTION_MOST = 600;

export type DescriptionLanguage = "en" | "fr";

/** What an operator is writing of a break: numbers as they are typed. */
export type BreakDraft = {
  name: string;
  latitude: string;
  longitude: string;
  characteristics: BreakCharacteristics;
  // Where offshore points, in degrees as typed: `characteristics` holds it as it was read.
  offshore: string;
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

/** Where offshore points, as a draft types it. */
export const offshoreDraftOf = (characteristics: BreakCharacteristics) =>
  characteristics.offshoreDirectionDegrees?.toString() ?? "";

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
    offshore: offshoreDraftOf(values.characteristics),
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

/** The degrees offshore points to, or null when nothing is typed or what is typed is not one. */
export function offshoreOf(typed: string) {
  const text = typed.trim();
  const degrees = Number(text);
  return text !== "" && Number.isInteger(degrees) && degrees >= 0 && degrees < 360 ? degrees : null;
}

// The most a bound of a size may be, in meters, as the API takes it.
const SIZE_MOST = 30;

const boundOf = (typed: string) =>
  typed.trim() === "" ? null : isNumber(typed, 0, SIZE_MOST) ? Number(typed) : undefined;

/** The size a draft says, null when it says none, or undefined while what is typed is not one. */
function sizeOfDraft({ min, max }: BreakDraft["size"]) {
  const least = boundOf(min);
  const most = boundOf(max);
  if (least === undefined || most === undefined) return undefined;
  if (least === null && most === null) return null;
  if (least !== null && most !== null && least > most) return undefined;
  return { min: least, max: most };
}

/**
 * The words of each line in the order the catalogue keeps them, and a line with none as one that
 * says nothing, whatever order the toggles were pressed in.
 */
export function linesInOrder(characteristics: BreakCharacteristics): BreakCharacteristics {
  const lines = Object.fromEntries(
    LIST_LINES.map((line) => {
      const words = characteristics[line] as readonly string[] | null;
      return [line, words && words.length > 0 ? inOrder(line, words) : null];
    }),
  );
  return { ...characteristics, ...lines };
}

/** Whether two drafts say the same, whatever order the words of a line were pressed in. */
export function sameDraft(one: BreakDraft, other: BreakDraft) {
  const plain = (draft: BreakDraft) =>
    JSON.stringify({ ...draft, characteristics: linesInOrder(draft.characteristics) });
  return plain(one) === plain(other);
}

/**
 * What is wrong with a draft, field by field: the schema the form checks once it is sent. It is
 * made at each render, so that it speaks the reader's language.
 */
export function draftSchema() {
  const describes = (text: string) => {
    const said = text.trim();
    return said === "" || (said.length >= 3 && said.length <= DESCRIPTION_MOST);
  };
  return z.object({
    name: z.string().refine((name) => name.trim() !== "", m.catalogue_fault_name()),
    latitude: z.string().refine((typed) => isNumber(typed, -90, 90), m.catalogue_fault_latitude()),
    longitude: z
      .string()
      .refine((typed) => isNumber(typed, -180, 180), m.catalogue_fault_longitude()),
    characteristics: z.custom<BreakCharacteristics>(),
    offshore: z
      .string()
      .refine(
        (typed) => typed.trim() === "" || offshoreOf(typed) !== null,
        m.catalogue_fault_offshore(),
      ),
    size: z.object({ min: z.string(), max: z.string() }).superRefine((size, issues) => {
      const message = m.catalogue_fault_size({ most: SIZE_MOST });
      const least = boundOf(size.min);
      const most = boundOf(size.max);
      if (least === undefined) issues.addIssue({ code: "custom", message, path: ["min"] });
      if (most === undefined) issues.addIssue({ code: "custom", message, path: ["max"] });
      if (typeof least === "number" && typeof most === "number" && least > most) {
        issues.addIssue({ code: "custom", message, path: ["max"] });
      }
    }),
    description: z
      .string()
      .refine(describes, m.catalogue_fault_description({ most: DESCRIPTION_MOST })),
    language: z.enum(["en", "fr"]),
  });
}

/** A draft as the API takes it. Call it once the schema finds nothing. */
export function valuesOf(draft: BreakDraft): BreakValues {
  const text = draft.description.trim();
  return {
    name: draft.name.trim(),
    latitude: Number(draft.latitude),
    longitude: Number(draft.longitude),
    characteristics: {
      ...linesInOrder(draft.characteristics),
      offshoreDirectionDegrees: offshoreOf(draft.offshore),
      waveSizeMeters: sizeOfDraft(draft.size) ?? null,
    },
    description: text === "" ? null : { text, language: draft.language },
  };
}

/**
 * The form a break is written in, by whoever holds the map beside it: the map moves its marker
 * with `setFieldValue`, and shows the point it holds. Decision 076.
 */
export function useBreakForm({
  defaultValues,
  onSubmit,
}: {
  defaultValues: BreakDraft;
  // The draft once the schema found nothing wrong with it.
  onSubmit: (draft: BreakDraft) => Promise<void>;
}) {
  return useAppForm({
    defaultValues,
    validators: { onSubmit: draftSchema() },
    onSubmit: ({ value }) => onSubmit(value),
  });
}

export type BreakForm = ReturnType<typeof useBreakForm>;

type BreakFieldsProps = {
  form: BreakForm;
  // What accounts confirmed of the break, which the guide shows over the catalogue's words.
  confirmed?: Partial<BreakCharacteristics>;
  // What to read beside the description while it is written, such as a list's own text.
  descriptionHint?: string;
};

/** The name, the point, what a break is like and its description, as an operator writes them. */
export function BreakFields({ form, confirmed = {}, descriptionHint }: BreakFieldsProps) {
  const id = useId();

  return (
    <div className="grid gap-m">
      <form.AppField name="name">
        {(field) => <field.Input label={m.catalogue_name()} autoComplete="off" />}
      </form.AppField>

      <div className="grid gap-xs">
        <div className="grid grid-cols-2 items-start gap-xs">
          <form.AppField name="latitude">
            {(field) => (
              <field.Input
                label={m.catalogue_latitude()}
                inputMode="decimal"
                autoComplete="off"
                aria-describedby={`${id}-point`}
              />
            )}
          </form.AppField>
          <form.AppField name="longitude">
            {(field) => (
              <field.Input
                label={m.catalogue_longitude()}
                inputMode="decimal"
                autoComplete="off"
                aria-describedby={`${id}-point`}
              />
            )}
          </form.AppField>
        </div>
        <p id={`${id}-point`} className="text-s text-neutral-7">
          {m.catalogue_point_hint()}
        </p>
      </div>

      {LIST_LINES.map((line) => {
        const over = readLine(line, confirmed[line] as string[] | null | undefined);
        return (
          <form.AppField key={line} name={`characteristics.${line}`}>
            {(field) => (
              <field.Choice
                multiple
                label={LINES[line].label()}
                description={over ? m.catalogue_confirmed({ words: over }) : undefined}
              >
                {Object.entries(LINES[line].words as Record<string, () => string>).map(
                  ([word, read]) => (
                    <ToggleGroupItem key={word} value={word}>
                      {read()}
                    </ToggleGroupItem>
                  ),
                )}
              </field.Choice>
            )}
          </form.AppField>
        );
      })}

      <form.AppField name="offshore">
        {(field) => (
          <field.Input
            label={m.moderation_said_offshore()}
            description={m.catalogue_offshore_hint()}
            inputMode="numeric"
            autoComplete="off"
            className="max-w-32"
          />
        )}
      </form.AppField>

      <fieldset className="grid gap-xs">
        <legend className="mb-xxs font-medium">{m.catalogue_size()}</legend>
        <div className="grid max-w-80 grid-cols-2 items-start gap-xs">
          <form.AppField name="size.min">
            {(field) => (
              <field.Input
                label={m.catalogue_size_min()}
                inputMode="decimal"
                autoComplete="off"
                aria-describedby={`${id}-size`}
              />
            )}
          </form.AppField>
          <form.AppField name="size.max">
            {(field) => (
              <field.Input
                label={m.catalogue_size_max()}
                inputMode="decimal"
                autoComplete="off"
                aria-describedby={`${id}-size`}
              />
            )}
          </form.AppField>
        </div>
        <p id={`${id}-size`} className="text-s text-neutral-7">
          {m.catalogue_size_hint()}
        </p>
      </fieldset>

      <div className="grid gap-xs">
        <form.Subscribe selector={(state) => state.values.language}>
          {(language) => (
            <form.AppField name="description">
              {(field) => (
                <field.Textarea
                  label={m.catalogue_description()}
                  description={descriptionHint ?? m.catalogue_description_hint()}
                  rows={4}
                  lang={language}
                />
              )}
            </form.AppField>
          )}
        </form.Subscribe>
        <div className="flex flex-wrap items-center justify-between gap-xs">
          <form.AppField name="language">
            {(field) => (
              <field.Control<DescriptionLanguage>>
                {(control) => (
                  <ToggleGroup
                    size="sm"
                    variant="outline"
                    aria-label={m.catalogue_description_language()}
                    value={[control.value]}
                    onValueChange={(chosen) => {
                      // A language is always chosen: pressing the one chosen keeps it.
                      const [language] = chosen as DescriptionLanguage[];
                      if (language) control.onChange(language);
                    }}
                  >
                    <ToggleGroupItem value="fr">{m.catalogue_language_fr()}</ToggleGroupItem>
                    <ToggleGroupItem value="en">{m.catalogue_language_en()}</ToggleGroupItem>
                  </ToggleGroup>
                )}
              </field.Control>
            )}
          </form.AppField>
          <form.Subscribe selector={(state) => state.values.description.trim().length}>
            {(length) => (
              <span className="text-s text-neutral-7 tabular-nums">
                {length} / {DESCRIPTION_MOST}
              </span>
            )}
          </form.Subscribe>
        </div>
      </div>
    </div>
  );
}
