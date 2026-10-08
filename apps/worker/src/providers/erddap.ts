import { parseCsv } from "./csv";

/** One row of a table: the text of a column, by its name. */
export type ErddapRow = (column: string) => string;

/**
 * Reads a table as an ERDDAP server writes it in CSV: a line of column names, a line of units,
 * then the rows. Returns a message when a column is missing or is not in the unit the caller
 * expects, since a change of unit would store wrong values silently. A column without a unit
 * expects "". A row is null when it is cut short.
 */
export function parseErddapCsv(text: string, expectedUnits: Record<string, string>) {
  const [header, unitRow, ...lines] = parseCsv(text);
  const columns = header ?? [];
  const units = unitRow ?? [];

  for (const [column, unit] of Object.entries(expectedUnits)) {
    const index = columns.indexOf(column);
    if (index === -1) return `the dataset has no ${column} column`;
    if (units[index] !== unit) return `${column} is in "${units[index] ?? ""}", not "${unit}"`;
  }

  const rows: (ErddapRow | null)[] = lines.map((fields) =>
    fields && fields.length === columns.length
      ? (column) => fields[columns.indexOf(column)] ?? ""
      : null,
  );
  return { rows };
}
