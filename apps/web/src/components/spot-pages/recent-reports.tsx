import { Link } from "@tanstack/react-router";

import { formatAgo } from "@/lib/format";
import type { SpotPage } from "@/lib/pages-api";
import { placeOnMap } from "@/lib/place-links";
import { m } from "@/paraglide/messages.js";

import { linked } from "../landing/legal-page";
import { sizesWords } from "../sessions/surf-size";
import { SpotSection } from "./spot-frame";

// What accounts showed of the waves at the break in the last week, as the page of the break shows
// it to whoever opens it: a picture of each report, with who sent it and when. Decision 067.

/** The last reports at a break, or what asks for one when there is none. */
export function RecentReports({ page, now }: { page: SpotPage; now: number }) {
  const reports = page.reports.filter((report) => report.media.some((item) => item.thumb));
  return (
    <SpotSection title={m.page_reports_title()} note={m.page_reports_note()}>
      {reports.length === 0 ? (
        <p className="text-neutral-7">{m.page_reports_empty()}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-s sm:grid-cols-3">
          {reports.map((report) => {
            const first = report.media.find((item) => item.thumb);
            const sizes = sizesWords(report.waveSize, report.setSize);
            return (
              <li key={report.id} className="grid gap-xxs">
                <img
                  src={first?.thumb ?? undefined}
                  alt={m.page_report_alt({ name: page.break.name, author: report.author ?? "" })}
                  loading="lazy"
                  decoding="async"
                  className="aspect-square w-full rounded-(--radius-xs) bg-neutral-3 object-cover"
                />
                <span className="text-s">
                  <span className="font-medium">{report.author ?? m.report_someone()}</span>
                  <span className="text-neutral-7"> · {formatAgo(report.createdAt, now)}</span>
                </span>
                {sizes && <span className="text-s text-neutral-7">{sizes}</span>}
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-s text-neutral-7">
        <Link {...placeOnMap("break", page.break.id)} className={linked}>
          {m.page_reports_send()}
        </Link>
      </p>
    </SpotSection>
  );
}
