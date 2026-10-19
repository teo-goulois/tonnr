import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import type { ReportFilter } from "@/components/moderation/wave-reports";

type TileProps = {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  // The page that says more.
  to?: "/accounts" | "/instance" | "/moderation";
  // What the moderation shows, when the tile leads there.
  search?: { kind: "reports"; state?: ReportFilter };
};

/** One number, with a word under it, and where it leads. */
export function Tile({ label, value, note, to, search }: TileProps) {
  const body = (
    <>
      <dt className="text-s text-neutral-7">{label}</dt>
      <dd className="text-xl font-medium tabular-nums">{value}</dd>
      {note !== undefined && <dd className="text-s text-neutral-7">{note}</dd>}
    </>
  );
  const className = "grid content-start gap-xxs rounded-(--radius-s) border border-neutral-3 p-s";
  return to ? (
    <Link
      to={to}
      search={search}
      className={`${className} focus-ring outline-none hover:bg-neutral-2`}
    >
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
