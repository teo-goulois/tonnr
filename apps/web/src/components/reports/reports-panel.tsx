import { isCounted, reportParts } from "@repo/client/reports/parts";
import { Button } from "@repo/ui/components/ui/button";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuSub,
  MenuSubPopup,
  MenuSubTrigger,
  MenuTrigger,
} from "@repo/ui/components/ui/menu";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { Spinner } from "@repo/ui/components/ui/spinner";
import { CameraIcon, MoreHorizontalIcon, PlayIcon } from "@repo/ui/icon";
import { useState } from "react";

import { formatAgo } from "@/lib/format";
import { formatDistance } from "@/lib/units";
import { reportCounter, useCountWhenSeen } from "@/lib/use-report-counts";
import { m } from "@/paraglide/messages.js";

import { MediaViewer } from "../sessions/media-viewer";
import { videoLength } from "../sessions/session-media";
import { sizesWords } from "../sessions/surf-size";
import { AccountPrompt } from "../viewer/saved-panel";
import type { Loadable, MediaItem } from "../viewer/types";
import { FLAG_REASONS, type FlagReason, type Report, type ReportReason } from "./types";

// The reports of the waves at a break: what accounts showed of it lately, in photos and videos
// checked to have been taken there and of the sea. The tab after the forecast. Decision 067.

/** Why a medium of a report is not shown, in the words of its author. */
export function reasonWords(reason: ReportReason, distanceKm: number | null) {
  switch (reason) {
    case "no_position":
      return m.report_reason_no_position();
    case "too_far":
      return distanceKm === null
        ? m.report_reason_far()
        : m.report_reason_too_far({ distance: formatDistance(distanceKm) });
    case "imprecise":
      return m.report_reason_imprecise();
    case "no_time":
      return m.report_reason_no_time();
    case "too_old":
      return m.report_reason_too_old();
    case "ahead":
      return m.report_reason_ahead();
    case "not_sea":
      return m.report_reason_not_sea();
    case "nudity":
      return m.report_reason_nudity();
    case "unsure":
      return m.report_reason_unsure();
    case "unreadable":
      return m.report_reason_unreadable();
  }
}

const FLAG_WORDS: Record<FlagReason, () => string> = {
  not_here: m.report_flag_not_here,
  not_now: m.report_flag_not_now,
  not_sea: m.report_flag_not_sea,
  offensive: m.report_flag_offensive,
  other: m.report_flag_other,
};

/** Where a report of the reader's stands, when it is not shown to everyone. */
function OwnState({ report }: { report: Report }) {
  if (report.state === "published") return null;
  if (report.state === "checking") {
    return (
      <p className="flex items-center gap-xs text-s text-neutral-7">
        <Spinner className="size-4" />
        {m.report_checking()}
      </p>
    );
  }
  if (report.state === "review")
    return <p className="text-s text-neutral-7">{m.report_review()}</p>;
  if (report.state === "hidden")
    return <p className="text-s text-neutral-7">{m.report_hidden()}</p>;
  return (
    <div className="grid gap-xxs text-s text-neutral-7">
      <p className="font-medium text-neutral-10">{m.report_refused()}</p>
      <ul className="grid list-disc gap-xxs pl-m">
        {report.reasons.map((reason) => (
          <li key={reason}>{reasonWords(reason, report.distanceKm)}</li>
        ))}
      </ul>
    </div>
  );
}

/** A photo or a video of a report, as a square that opens it. */
function Shot({ item, onOpen }: { item: MediaItem; onOpen: () => void }) {
  if (item.state !== "ready") {
    return (
      <span className="grid size-24 shrink-0 place-items-center rounded-(--radius-xs) bg-neutral-3">
        <Spinner className="size-5 text-neutral-7" />
      </span>
    );
  }
  return (
    <button
      type="button"
      aria-label={m.media_open()}
      className="focus-ring relative size-24 shrink-0 cursor-pointer overflow-hidden rounded-(--radius-xs) bg-neutral-3 outline-none"
      onClick={onOpen}
    >
      {item.thumb && (
        <img
          src={item.thumb}
          alt=""
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
        />
      )}
      {item.kind === "video" && (
        <span className="absolute bottom-xxs left-xxs flex items-center gap-xxs rounded-full bg-neutral-10-transparent px-xxs text-xs text-neutral-1 tabular-nums">
          <PlayIcon aria-hidden className="size-2.5" />
          {item.durationMs !== null && videoLength(item.durationMs)}
        </span>
      )}
    </button>
  );
}

type ReportCardProps = {
  report: Report;
  now: number;
  signedIn: boolean;
  onOpen: (report: Report, item: MediaItem) => void;
  onDelete: (report: Report) => Promise<boolean>;
  onFlag: (report: Report, reason: FlagReason) => Promise<boolean>;
  // Asks whether to block the author of another's report, by its username: decision 071.
  onBlock: (username: string) => void;
};

/**
 * What the author of a report reads of it, and nobody else: how many saw it, opened its photos,
 * and were told of it. Decision 068.
 */
export function ReportStats({ stats }: { stats: NonNullable<Report["stats"]> }) {
  const { views, opens, told } = stats;
  return (
    <p className="text-xs text-neutral-7">
      {[
        views === 1 ? m.report_views_one() : m.report_views({ count: views }),
        opens === 1 ? m.report_opens_one() : m.report_opens({ count: opens }),
        told === 1 ? m.report_told_one() : m.report_told({ count: told }),
      ].join(" · ")}
      {" · "}
      {m.report_stats_private()}
    </p>
  );
}

/** A report: who sent it and when, from how far, its photos, how big it looked, and a few words. */
export function ReportCard({
  report,
  now,
  signedIn,
  onOpen,
  onDelete,
  onFlag,
  onBlock,
}: ReportCardProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  // Another's report that is shown is counted once this browser has seen it: decision 068.
  const counted = isCounted(report) ? report.id : null;
  const seenRef = useCountWhenSeen<HTMLLIElement>(counted);
  const sizes = sizesWords(report.waveSize, report.setSize);
  const when =
    now - report.createdAt.getTime() < 60_000
      ? m.report_just_now()
      : formatAgo(report.createdAt, now);
  return (
    <li ref={seenRef} className="grid gap-xs">
      <div className="flex items-center gap-xs">
        <p className="min-w-0 flex-1 truncate text-s text-neutral-7">
          <span className="font-medium text-neutral-10">{report.author ?? m.report_someone()}</span>
          {" · "}
          {when}
          {report.distanceKm !== null &&
            ` · ${m.report_from({ distance: formatDistance(report.distanceKm, 1) })}`}
        </p>
        {signedIn && (
          <Menu>
            <MenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={m.report_menu({ author: report.author ?? m.report_someone() })}
                  isPending={isDeleting}
                  disabled={isDeleting}
                />
              }
            >
              <MoreHorizontalIcon data-slot="icon" aria-hidden />
            </MenuTrigger>
            <MenuPopup align="end" className="min-w-56">
              {report.mine ? (
                <MenuItem
                  variant="destructive"
                  onClick={() => {
                    setIsDeleting(true);
                    void onDelete(report).finally(() => setIsDeleting(false));
                  }}
                >
                  {m.report_delete()}
                </MenuItem>
              ) : (
                <>
                  {report.flagged ? (
                    <MenuItem disabled>{m.report_flag_done()}</MenuItem>
                  ) : (
                    <MenuSub>
                      <MenuSubTrigger>{m.report_flag()}</MenuSubTrigger>
                      <MenuSubPopup className="min-w-56">
                        {FLAG_REASONS.map((reason) => (
                          <MenuItem key={reason} onClick={() => void onFlag(report, reason)}>
                            {FLAG_WORDS[reason]()}
                          </MenuItem>
                        ))}
                      </MenuSubPopup>
                    </MenuSub>
                  )}
                  {/* Beside the flag, what hides every report of its author from the reader
                      alone: decision 071. An author with no name is blocked by none. */}
                  {report.author && (
                    <MenuItem
                      variant="destructive"
                      onClick={() => report.author && onBlock(report.author)}
                    >
                      {m.block_account({ username: report.author })}
                    </MenuItem>
                  )}
                </>
              )}
            </MenuPopup>
          </Menu>
        )}
      </div>
      {report.media.length > 0 && (
        <ul className="-mx-xs flex gap-xs overflow-x-auto px-xs">
          {report.media.map((item) => (
            <li key={item.id}>
              <Shot
                item={item}
                onOpen={() => {
                  if (counted) reportCounter()?.opened(counted);
                  onOpen(report, item);
                }}
              />
            </li>
          ))}
        </ul>
      )}
      {sizes && <p className="text-s">{sizes}</p>}
      {report.note && <p className="text-s text-pretty">{report.note}</p>}
      {report.mine && <OwnState report={report} />}
      {report.mine && report.state === "published" && report.stats && (
        <ReportStats stats={report.stats} />
      )}
    </li>
  );
}

type ReportsPanelProps = {
  now: number;
  signedIn: boolean;
  reports: Loadable<Report[]>;
  // Whether the reader can send one: an instance that keeps no photo takes none.
  offered: boolean;
  onSend: () => void;
  onSignIn: () => void;
  onCreateAccount: () => void;
  onDelete: (report: Report) => Promise<boolean>;
  onFlag: (report: Report, reason: FlagReason) => Promise<boolean>;
  onBlock: (username: string) => void;
};

/**
 * What accounts showed of the waves at a break lately: the reports of the last hours first,
 * then those of the week. A visitor reads them, and an account sends one.
 */
export function ReportsPanel({
  now,
  signedIn,
  reports,
  offered,
  onSend,
  onSignIn,
  onCreateAccount,
  onDelete,
  onFlag,
  onBlock,
}: ReportsPanelProps) {
  const [shown, setShown] = useState<{ reportId: string; mediaId: string } | null>(null);
  const viewed = reports.data?.find((report) => report.id === shown?.reportId);
  const { now: fresh, week: older } = reportParts(reports.data ?? [], now);

  const card = (report: Report) => (
    <ReportCard
      key={report.id}
      report={report}
      now={now}
      signedIn={signedIn}
      onOpen={(one, item) => setShown({ reportId: one.id, mediaId: item.id })}
      onDelete={onDelete}
      onFlag={onFlag}
      onBlock={onBlock}
    />
  );

  return (
    <div className="grid gap-l">
      <div className="grid justify-items-start gap-s">
        <p className="text-s text-neutral-7">{m.reports_intro()}</p>
        {signedIn ? (
          offered && (
            <Button variant="secondary" onClick={onSend}>
              <CameraIcon data-slot="icon" aria-hidden />
              {m.report_send()}
            </Button>
          )
        ) : (
          <AccountPrompt
            text={m.report_sign_in_prompt()}
            onSignIn={onSignIn}
            onCreateAccount={onCreateAccount}
          />
        )}
      </div>

      {reports.isError ? (
        <p className="text-s text-neutral-7">{m.reports_load_failed()}</p>
      ) : !reports.data ? (
        <div className="grid gap-s">
          <Skeleton className="h-(--line-m) w-2/5 rounded-(--radius-xs)" />
          <Skeleton className="h-24 rounded-(--radius-xs)" />
        </div>
      ) : reports.data.length === 0 ? (
        <p className="text-s text-neutral-7">{m.reports_empty()}</p>
      ) : (
        <>
          {fresh.length > 0 && (
            <section className="grid gap-s">
              <h3 className="font-medium">{m.reports_now()}</h3>
              <ul className="grid gap-l">{fresh.map(card)}</ul>
            </section>
          )}
          {older.length > 0 && (
            <section className="grid gap-s">
              <h3 className="font-medium">{m.reports_week()}</h3>
              <ul className="grid gap-l">{older.map(card)}</ul>
            </section>
          )}
        </>
      )}

      <MediaViewer
        items={viewed?.media ?? []}
        label={m.report_viewer_title()}
        shown={shown?.mediaId ?? null}
        onShow={(mediaId) =>
          setShown(mediaId && shown ? { reportId: shown.reportId, mediaId } : null)
        }
      />
    </div>
  );
}
