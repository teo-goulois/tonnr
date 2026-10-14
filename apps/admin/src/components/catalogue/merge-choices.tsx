import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/ui/toggle-group";
import { useState } from "react";

import type { BreakCharacteristics, BreakValues, OperatorBreak } from "@/lib/api";
import { formatCount } from "@/lib/format";
import { m } from "@/paraglide/messages.js";

import { inOrder, LINES, LIST_LINES, type ListLine, readLine } from "./words";

/** What one side of a merge says of a break. */
export type Side = {
  name: string;
  latitude: number;
  longitude: number;
  characteristics: BreakCharacteristics;
  description: OperatorBreak["description"];
};

export type Field = "name" | "point" | ListLine | "offshoreDirectionDegrees" | "description";
type Choice = "kept" | "other" | "both";
export type Choices = Record<Field, Choice>;

const FIELDS: Field[] = ["name", "point", ...LIST_LINES, "offshoreDirectionDegrees", "description"];

function valueOf(side: Side, field: Field): unknown {
  if (field === "name") return side.name;
  if (field === "point") return [side.latitude, side.longitude];
  if (field === "description") return side.description;
  return side.characteristics[field];
}

const isSaid = (value: unknown) =>
  value !== null && value !== undefined && !(Array.isArray(value) && value.length === 0);

const same = (one: unknown, other: unknown) =>
  JSON.stringify(Array.isArray(one) ? [...one].sort() : one) ===
  JSON.stringify(Array.isArray(other) ? [...other].sort() : other);

/**
 * What a merge takes of each side by default: what the break that stays says, and what the
 * other says where the first says nothing.
 */
export function fillBlanks(kept: Side, other: Side): Choices {
  return Object.fromEntries(
    FIELDS.map((field) => [
      field,
      isSaid(valueOf(kept, field)) || !isSaid(valueOf(other, field)) ? "kept" : "other",
    ]),
  ) as Choices;
}

/** What the break that stays takes, from both sides and the choices. */
export function mergedValues(kept: Side, other: Side, choices: Choices): BreakValues {
  const pick = (field: Field) => (choices[field] === "other" ? other : kept);
  const characteristics = { ...kept.characteristics };
  for (const line of LIST_LINES) {
    const words =
      choices[line] === "both"
        ? inOrder(line, [
            ...(kept.characteristics[line] ?? []),
            ...(other.characteristics[line] ?? []),
          ])
        : (pick(line).characteristics[line] ?? null);
    (characteristics as Record<string, unknown>)[line] = words && words.length > 0 ? words : null;
  }
  characteristics.offshoreDirectionDegrees = pick(
    "offshoreDirectionDegrees",
  ).characteristics.offshoreDirectionDegrees;
  return {
    name: pick("name").name,
    latitude: pick("point").latitude,
    longitude: pick("point").longitude,
    characteristics,
    description: pick("description").description,
  };
}

function read(side: Side, field: Field) {
  if (field === "name") return side.name;
  if (field === "point") return `${side.latitude.toFixed(5)}, ${side.longitude.toFixed(5)}`;
  if (field === "description") return side.description?.text ?? null;
  if (field === "offshoreDirectionDegrees") {
    const degrees = side.characteristics.offshoreDirectionDegrees;
    return degrees === null ? null : `${degrees}°`;
  }
  return readLine(field, side.characteristics[field]);
}

function labelOf(field: Field) {
  if (field === "name") return m.catalogue_name();
  if (field === "point") return m.catalogue_point();
  if (field === "description") return m.catalogue_description();
  if (field === "offshoreDirectionDegrees") return m.moderation_said_offshore();
  return LINES[field].label();
}

export function useChoices(kept: Side, other: Side) {
  return useState<Choices>(() => fillBlanks(kept, other));
}

type MergeChoicesProps = {
  kept: Side;
  other: Side;
  // What each side is called: the break that stays, and the break or the candidate.
  keptLabel: string;
  otherLabel: string;
  choices: Choices;
  onChange: (choices: Choices) => void;
  // A field the operator writes apart, such as the description of a break a candidate goes into.
  without?: Field[];
};

/**
 * Where two sides of a merge differ, what each says, for the operator to choose: by default
 * what the break that stays says, and what the other says where it says nothing.
 */
export function MergeChoices({
  kept,
  other,
  keptLabel,
  otherLabel,
  choices,
  onChange,
  without = [],
}: MergeChoicesProps) {
  const fields = FIELDS.filter((field) => !without.includes(field));
  const differ = fields.filter((field) => !same(valueOf(kept, field), valueOf(other, field)));
  const alike = fields.length - differ.length;

  // A value as a choice: a text may be long, so it wraps inside its box.
  const choice =
    "h-auto min-h-8 justify-start rounded-(--radius-xs) py-xxs text-left whitespace-normal";
  const nothing = <span className="text-neutral-6">{m.catalogue_nothing()}</span>;

  return (
    <div className="grid gap-s">
      {differ.length > 0 && (
        <div className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)_minmax(0,1fr)] gap-xs text-s text-neutral-7">
          <span />
          <span>{keptLabel}</span>
          <span>{otherLabel}</span>
        </div>
      )}
      {differ.map((field) => {
        const isList = (LIST_LINES as string[]).includes(field);
        const both = isList && isSaid(valueOf(kept, field)) && isSaid(valueOf(other, field));
        const keptRead = read(kept, field);
        const otherRead = read(other, field);
        return (
          <div
            key={field}
            className="grid grid-cols-[minmax(0,7rem)_minmax(0,2fr)] items-start gap-xs"
          >
            <span className="pt-xxs text-s font-medium">{labelOf(field)}</span>
            <ToggleGroup
              size="sm"
              variant="outline"
              aria-label={labelOf(field)}
              className="grid grid-cols-2 gap-xs"
              value={[choices[field]]}
              onValueChange={(chosen) => {
                const [next] = chosen as Choice[];
                if (next) onChange({ ...choices, [field]: next });
              }}
            >
              <ToggleGroupItem
                value="kept"
                aria-label={`${keptLabel} : ${keptRead ?? m.catalogue_nothing()}`}
                className={choice}
              >
                {keptRead ?? nothing}
              </ToggleGroupItem>
              <ToggleGroupItem
                value="other"
                aria-label={`${otherLabel} : ${otherRead ?? m.catalogue_nothing()}`}
                className={choice}
              >
                {otherRead ?? nothing}
              </ToggleGroupItem>
              {both && (
                <ToggleGroupItem value="both" className="col-span-2 justify-self-start">
                  {m.catalogue_both()}
                </ToggleGroupItem>
              )}
            </ToggleGroup>
          </div>
        );
      })}
      {differ.length === 0 ? (
        <p className="text-neutral-7">{m.catalogue_alike_all()}</p>
      ) : (
        alike > 0 && (
          <p className="text-s text-neutral-7">
            {m.catalogue_alike({ count: formatCount(alike) })}
          </p>
        )
      )}
    </div>
  );
}
