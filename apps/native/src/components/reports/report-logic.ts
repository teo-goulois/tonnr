import type { Report } from "@repo/client/reports/types";
import { REPORT_NOW_HOURS } from "@repo/config/media";

// The rules of the reports' tab that read no screen: which reports a phone counts, and which are
// the sea of now. Decisions 067 and 068.

const HOUR_MS = 60 * 60 * 1000;

/** Whether a report is counted seen and opened by this phone: another's that is shown. */
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
