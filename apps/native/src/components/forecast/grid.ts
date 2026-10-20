import type { Column } from "@repo/client/viewer/grid";

// The columns of the week's table, and the rows a density draws, live in packages/client, which
// the web's `ForecastGrid` lays them with too. Here is where a finger and the table stand among
// them. Pure, so that a test reads it.

export {
  type Column,
  GRID_ROWS,
  type GridRow,
  STEP_HOURS,
  gridColumns,
} from "@repo/client/viewer/grid";

/** How many columns each day of the table holds, from the first column of each. */
export function dayLengths(columns: Column[]) {
  const lengths = new Map<number, number>();
  for (const column of columns) lengths.set(column.day, (lengths.get(column.day) ?? 0) + 1);
  return lengths;
}

/** The column under a point of the table, `x` from the start of the first column. */
export function columnAt(columns: Column[], x: number, width: number) {
  if (columns.length === 0) return undefined;
  return Math.min(columns.length - 1, Math.max(0, Math.floor(x / width)));
}

/**
 * Where the table opens: now at its left, after the columns of the past it is asked to keep.
 * Zero when now is not among its columns.
 */
export function homeOffset(columns: Column[], lead: number, width: number) {
  const index = columns.findIndex((column) => column.isNow);
  return index < 0 ? 0 : Math.max(0, (index - lead) * width);
}
