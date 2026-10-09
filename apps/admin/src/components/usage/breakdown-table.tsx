import { Skeleton } from "@repo/ui/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/ui/table";
import type { ReactNode } from "react";

import type { BreakdownRow } from "@/lib/api";
import { formatCount } from "@/lib/format";
import { OUTCOMES, totalOf } from "@/lib/usage";
import { m } from "@/paraglide/messages.js";

import { OUTCOME_HINTS, OUTCOME_LABELS } from "./outcomes";

type BreakdownTableProps = {
  // What the rows are, for the first column's heading.
  heading: string;
  // Undefined while the counts load.
  rows: BreakdownRow[] | undefined;
  // What to write for a row. Without it, the row's name, or else its id.
  label?: (row: BreakdownRow) => ReactNode;
  // What to say when nothing was counted.
  empty: string;
};

/** The calls of a span of time, row by row, with what came of them. */
export function BreakdownTable({ heading, rows, label, empty }: BreakdownTableProps) {
  if (rows?.length === 0) return <p className="text-s text-neutral-7">{empty}</p>;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{heading}</TableHead>
          <TableHead className="text-right">{m.usage_total()}</TableHead>
          {OUTCOMES.map((outcome) => (
            <TableHead key={outcome} className="text-right" title={OUTCOME_HINTS[outcome]()}>
              {OUTCOME_LABELS[outcome]()}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows
          ? rows.map((row) => (
              <TableRow key={row.id ?? ""}>
                <TableCell className="max-w-72 truncate">
                  {label ? label(row) : (row.name ?? row.id)}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {formatCount(totalOf(row))}
                </TableCell>
                {OUTCOMES.map((outcome) => (
                  <TableCell key={outcome} className="text-right text-neutral-7 tabular-nums">
                    {formatCount(row[outcome])}
                  </TableCell>
                ))}
              </TableRow>
            ))
          : [0, 1, 2].map((row) => (
              <TableRow key={row}>
                <TableCell colSpan={OUTCOMES.length + 2}>
                  <Skeleton className="h-5 w-full" />
                </TableCell>
              </TableRow>
            ))}
      </TableBody>
    </Table>
  );
}
