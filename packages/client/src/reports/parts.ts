import { REPORT_NOW_HOURS } from "@repo/config/media";

import type { Report } from "./types";

// What a break's reports are read as, on the web and on a phone alike: which a device counts,
// and which are the sea of now. Decisions 067 and 068.

const HOUR_MS = 60 * 60 * 1000;

/** Whether a device counts a report seen and opened: another's that is shown. Decision 068. */
export const isCounted = (report: Pick<Report, "state" | "mine">) =>
  report.state === "published" && !report.mine;

/**
 * The reports of the last hours, which are the sea of now, then the others of the week, each in
 * the order given, the latest first.
 */
export function reportParts<Item extends Pick<Report, "createdAt">>(
  reports: readonly Item[],
  now: number,
) {
  const recent = (report: Item) => now - report.createdAt.getTime() < REPORT_NOW_HOURS * HOUR_MS;
  return {
    now: reports.filter(recent),
    week: reports.filter((report) => !recent(report)),
  };
}
