import { Fragment } from "react";

import { m } from "@/paraglide/messages.js";

import { PointConditions, type PointConditionsProps, Section, Sources } from "./point-conditions";
import type { Loadable, PrivateBreak } from "./types";

type PrivateBreakPanelProps = PointConditionsProps & {
  found: Loadable<PrivateBreak>;
};

// A field of the list: its name as the file writes it, that name in words, and its value.
type Row = { name: string; label: string; value: string };
type Group = { title: string | undefined; rows: Row[] };

// A field's name as the list writes it, such as `preferredTides`, made into words.
function wordsOf(name: string) {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * A value as text, or undefined when it says nothing: a field left empty stays out of the panel,
 * where a zero or a "no" is something the list said. A field inside another keeps its name, so
 * that a minimum is not read as a maximum, nor a figure without the unit the list gave it.
 */
function textOf(value: unknown): string | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  if (Array.isArray(value)) {
    const items = value.map(textOf).filter((item) => item !== undefined);
    if (items.length === 0) return undefined;
    // Items that hold fields are set apart more than the fields within one.
    return items.join(value.some(isRecord) ? "; " : ", ");
  }
  if (isRecord(value)) {
    const fields = Object.entries(value)
      .map(([name, field]) => [name, textOf(field)] as const)
      .filter(([, text]) => text !== undefined);
    if (fields.length === 0) return undefined;
    return fields.map(([name, text]) => `${wordsOf(name).toLowerCase()} ${text}`).join(", ");
  }
  return String(value);
}

function rowOf(name: string, value: unknown): Row | undefined {
  const text = textOf(value);
  return text === undefined ? undefined : { name, label: wordsOf(name), value: text };
}

/**
 * What the list says of a break, as its file gave it: the fields that stand alone first, then
 * one group for each field that holds others. Nothing is converted, and no unit is read into a
 * figure.
 */
function groupsOf(details: Record<string, unknown>): Group[] {
  const alone: Row[] = [];
  const groups: Group[] = [];

  for (const [name, value] of Object.entries(details)) {
    if (!isRecord(value)) {
      const row = rowOf(name, value);
      if (row) alone.push(row);
      continue;
    }
    const rows = Object.entries(value)
      .map(([field, inner]) => rowOf(field, inner))
      .filter((row) => row !== undefined);
    if (rows.length > 0) groups.push({ title: wordsOf(name), rows });
  }
  return alone.length > 0 ? [{ title: undefined, rows: alone }, ...groups] : groups;
}

/** The forecast and the tide at a break of the instance's private list, and what the list says of it. */
export function PrivateBreakPanel({
  now,
  found,
  forecast,
  tides,
  extremes,
  onTideExtend,
}: PrivateBreakPanelProps) {
  // A break that has left the list may still be in the cache, so the error comes first.
  if (found.isError) return <p className="text-s text-neutral-7">{m.break_not_found()}</p>;

  const groups = found.data ? groupsOf(found.data.details) : [];

  return (
    <div className="grid gap-l">
      <PointConditions
        now={now}
        forecast={forecast}
        tides={tides}
        extremes={extremes}
        onTideExtend={onTideExtend}
      />
      {groups.length > 0 && (
        <Section title={m.private_break_details()}>
          <div className="grid gap-s">
            {groups.map((group, index) => (
              // The groups keep their order for one break, and two names can read the same once
              // made into words, so neither a title nor a label is a key.
              // eslint-disable-next-line react/no-array-index-key
              <div key={index} className="grid gap-xxs">
                {group.title && <h4 className="text-s font-medium">{group.title}</h4>}
                <dl className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-x-s gap-y-xxs text-s">
                  {group.rows.map((row) => (
                    <Fragment key={row.name}>
                      <dt className="text-neutral-7">{row.label}</dt>
                      <dd className="break-words">{row.value}</dd>
                    </Fragment>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </Section>
      )}
      <Sources
        origin={found.data && m.private_break_source()}
        license={null}
        forecast={forecast.data}
        tides={tides.data}
      />
    </div>
  );
}
