/**
 * Splits one line of CSV into its fields, or returns null when its quotes are not those of CSV:
 * one left open, one in the middle of a field, or text after a closing one. A field in double
 * quotes may contain commas.
 */
export function parseCsvLine(line: string) {
  const fields: string[] = [];
  let field = "";
  // "open" inside a quoted field, "closed" between its closing quote and the next comma.
  let quote: "none" | "open" | "closed" = "none";

  for (let index = 0; index < line.length; index += 1) {
    const character = line.charAt(index);
    if (quote === "open") {
      if (character === '"' && line.charAt(index + 1) === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quote = "closed";
      } else {
        field += character;
      }
    } else if (character === ",") {
      fields.push(field);
      field = "";
      quote = "none";
    } else if (quote === "closed") {
      if (character.trim() !== "") return null;
    } else if (character === '"') {
      if (field.trim() !== "") return null;
      field = "";
      quote = "open";
    } else {
      field += character;
    }
  }
  if (quote === "open") return null;
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
