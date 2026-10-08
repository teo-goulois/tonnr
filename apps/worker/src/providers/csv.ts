/**
 * Splits one line of CSV into its fields, or returns null when a quote is left open. A field in
 * double quotes may contain commas.
 */
export function parseCsvLine(line: string) {
  const fields: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quoted) {
      if (character === '"' && line[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      fields.push(field);
      field = "";
    } else {
      field += character;
    }
  }
  if (quoted) return null;
  fields.push(field);

  return fields.map((value) => value.trim());
}

/**
 * Splits a CSV text into its lines of fields, leaving out the empty lines. A line is null when
 * it cannot be trusted: a quote left open, or a last line with no line break after it, which is
 * how a file that is still being written ends. A field cannot hold a line break.
 */
export function parseCsv(text: string) {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  // A complete text ends with a line break, so the last piece is empty.
  const cutShort = lines.pop() !== "";

  const rows = lines.filter((line) => line.trim() !== "").map(parseCsvLine);
  if (cutShort) rows.push(null);
  return rows;
}

/** The number a field holds, or NaN for an empty field, which `Number` would read as zero. */
export function fieldNumber(field: string) {
  return field === "" ? Number.NaN : Number(field);
}
