import { Badge } from "@repo/ui/components/ui/badge";
import { Button } from "@repo/ui/components/ui/button";
import { Tabs, TabsList, TabsTab } from "@repo/ui/components/ui/tabs";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Loader } from "@/components/shared/loader";
import type { ReportState, ReviewedReport } from "@/lib/api";
import { formatAgo, formatCount, formatDayAndHour } from "@/lib/format";
import { m } from "@/paraglide/messages.js";
import { client, orpc, refreshLists } from "@/utils/orpc";

import { REASONS, ReportChecks } from "./report-checks";

// What accounts show of the waves at a break as they are now, for an operator to show or to
// remove: decision 067. A report older than a week is shown to no one but the operators.

/** Which reports are listed: one state, those that accounts flagged, or all of them. */
export const REPORT_FILTERS = [
  "review",
  "flagged",
  "published",
  "refused",
  "hidden",
  "removed",
  "all",
] as const;
export type ReportFilter = (typeof REPORT_FILTERS)[number];

const FILTER_NAMES: Record<ReportFilter, () => string> = {
  review: m.reports_filter_review,
  flagged: m.reports_filter_flagged,
  published: m.reports_filter_published,
  refused: m.reports_filter_refused,
  hidden: m.reports_filter_hidden,
  removed: m.reports_filter_removed,
  all: m.reports_filter_all,
};
const EMPTY: Record<ReportFilter, () => string> = {
  review: m.reports_empty_review,
  flagged: m.reports_empty_flagged,
  published: m.reports_empty_published,
  refused: m.reports_empty_refused,
  hidden: m.reports_empty_hidden,
  removed: m.reports_empty_removed,
  all: m.reports_empty_all,
};

const STATES: Record<
  ReportState,
  { label: () => string; variant: "neutral" | "success" | "warning" | "error" }
> = {
  checking: { label: m.reports_state_checking, variant: "neutral" },
  published: { label: m.reports_state_published, variant: "success" },
  review: { label: m.reports_state_review, variant: "warning" },
  refused: { label: m.reports_state_refused, variant: "error" },
  hidden: { label: m.reports_state_hidden, variant: "warning" },
  removed: { label: m.reports_state_removed, variant: "error" },
};

const SIZES: Record<NonNullable<ReviewedReport["waveSize"]>, () => string> = {
  ankle: m.reports_size_ankle,
  knee: m.reports_size_knee,
  waist: m.reports_size_waist,
  chest: m.reports_size_chest,
  shoulder: m.reports_size_shoulder,
  head: m.reports_size_head,
  overhead: m.reports_size_overhead,
  double_overhead: m.reports_size_double_overhead,
  triple_overhead: m.reports_size_triple_overhead,
};

// Why an account said a report should not be shown. A reason of a later API is shown as it is.
const FLAG_REASONS: Record<string, () => string> = {
  not_here: m.reports_flag_not_here,
  not_now: m.reports_flag_not_now,
  not_sea: m.reports_flag_not_sea,
  offensive: m.reports_flag_offensive,
  other: m.reports_flag_other,
};

const linked = "focus-ring rounded-xs underline underline-offset-2 hover:text-neutral-10";

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid content-start gap-xxs">
      <dt className="text-s text-neutral-7">{label}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  );
}

function None() {
  return <span className="text-neutral-7">{m.moderation_none()}</span>;
}

// The place on OpenStreetMap, to see where the phone stood.
function mapOf({ latitude, longitude }: { latitude: number; longitude: number }) {
  return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=15/${latitude}/${longitude}`;
}

/** Each reason the accounts gave, once, with how many gave it. */
function flagReasons(reasons: readonly string[]) {
  const counted = new Map<string, number>();
  for (const reason of reasons) counted.set(reason, (counted.get(reason) ?? 0) + 1);
  return [...counted].map(([reason, count]) => {
    const said = FLAG_REASONS[reason]?.() ?? reason;
    return count > 1 ? `${said} (${formatCount(count)})` : said;
  });
}

type CardProps = {
  report: ReviewedReport;
  now: number;
  isBusy: boolean;
  onShow: () => void;
  onRemove: () => void;
};

/** One report: its break, who sent it and when, what they said, and each photo as it was checked. */
function Card({ report, now, isBusy, onShow, onRemove }: CardProps) {
  const state = STATES[report.state];
  const flags = flagReasons(report.flags.reasons);

  return (
    <li className="edge grid gap-m rounded-m p-m [--edge-color:var(--neutral-4)]">
      <div className="flex flex-wrap items-center justify-between gap-s">
        <h2 className="flex flex-wrap items-center gap-xs text-m font-medium">
          <Link to="/catalogue" search={{ break: report.breakId }} className={linked}>
            {report.breakName}
          </Link>
          <Badge variant={state.variant}>{state.label()}</Badge>
        </h2>
        <span className="text-s text-neutral-7">
          {m.reports_sent({ ago: formatAgo(report.createdAt, now) })}
          {" · "}
          {formatDayAndHour(report.createdAt)}
        </span>
      </div>

      <dl className="grid gap-m sm:grid-cols-2 lg:grid-cols-3">
        <Fact label={m.reviews_author()}>
          <Link
            to="/accounts/$accountId"
            params={{ accountId: report.authorId }}
            className={linked}
          >
            {report.author ? `@${report.author}` : m.reviews_no_username()}
          </Link>
        </Fact>
        <Fact label={m.reports_size()}>
          {report.waveSize || report.setSize ? (
            <span className="grid gap-xxs">
              {report.waveSize && (
                <span>{m.reports_size_waves({ size: SIZES[report.waveSize]() })}</span>
              )}
              {report.setSize && (
                <span>{m.reports_size_sets({ size: SIZES[report.setSize]() })}</span>
              )}
            </span>
          ) : (
            <None />
          )}
        </Fact>
        <Fact label={m.moderation_note()}>{report.note ? `« ${report.note} »` : <None />}</Fact>
        <Fact label={m.reports_flags()}>
          {report.flags.count > 0 ? (
            <span className="grid gap-xxs">
              <span>
                {report.flags.count === 1
                  ? m.reports_flags_one()
                  : m.reports_flags_some({ count: formatCount(report.flags.count) })}
              </span>
              {flags.length > 0 && <span className="text-neutral-7">{flags.join(", ")}</span>}
            </span>
          ) : (
            <None />
          )}
        </Fact>
        <Fact label={m.reports_found()}>
          {report.reasons.length > 0 ? (
            <ul className="grid gap-xxs">
              {report.reasons.map((reason) => (
                <li key={reason}>{REASONS[reason]()}</li>
              ))}
            </ul>
          ) : report.checkedAt ? (
            m.reports_found_nothing()
          ) : (
            <span className="text-neutral-7">{m.reports_checks_waiting()}</span>
          )}
        </Fact>
        {(report.checkedAt || report.decidedAt) && (
          <Fact label={m.reports_history()}>
            <span className="grid gap-xxs">
              {report.checkedAt && (
                <span>{m.reports_checked({ at: formatDayAndHour(report.checkedAt) })}</span>
              )}
              {report.decidedAt && (
                <span>{m.reports_decided({ at: formatDayAndHour(report.decidedAt) })}</span>
              )}
            </span>
          </Fact>
        )}
        {report.device && (
          <Fact label={m.reports_device()}>
            <span className="grid gap-xxs">
              <a href={mapOf(report.device)} target="_blank" rel="noreferrer" className={linked}>
                <span className="tabular-nums">
                  {report.device.latitude.toFixed(5)}, {report.device.longitude.toFixed(5)}
                </span>
              </a>
              {report.device.accuracyM !== null && (
                <span className="text-neutral-7">
                  {m.reports_device_accuracy({ meters: formatCount(report.device.accuracyM) })}
                </span>
              )}
            </span>
          </Fact>
        )}
      </dl>

      <ReportChecks report={report} />

      <div className="flex flex-wrap gap-xs">
        <Button disabled={isBusy || report.state === "published"} onClick={onShow}>
          {m.reports_show()}
        </Button>
        <Button
          variant="outline"
          disabled={isBusy || report.state === "removed"}
          onClick={onRemove}
        >
          {m.reports_remove()}
        </Button>
      </div>
    </li>
  );
}

type WaveReportsProps = {
  filter: ReportFilter;
  onFilterChange: (filter: ReportFilter) => void;
  // Undefined while the first page loads.
  reports: ReviewedReport[] | undefined;
  // Set when earlier reports follow those on screen.
  onMore?: () => void;
  isLoadingMore: boolean;
  now: number;
};

/**
 * The reports of the waves at the breaks, the latest first, with what the worker checked of each
 * photo and video: where and when it was taken, and what the analysis saw. An operator shows one
 * the checks left to them, or removes one that should not be seen. Decision 067.
 */
export function WaveReports({
  filter,
  onFilterChange,
  reports,
  onMore,
  isLoadingMore,
  now,
}: WaveReportsProps) {
  const queryClient = useQueryClient();
  // What the dialog asks, kept while it closes so that its words do not change meanwhile.
  const [deciding, setDeciding] = useState<{
    report: ReviewedReport;
    decision: "publish" | "remove";
  } | null>(null);
  const [isAsking, setAsking] = useState(false);
  const ask = (report: ReviewedReport, decision: "publish" | "remove") => {
    setDeciding({ report, decision });
    setAsking(true);
  };

  const decided = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: orpc.v1.reports.key() }),
      refreshLists(queryClient),
    ]);
  const decide = useMutation({
    mutationFn: (asked: { report: ReviewedReport; decision: "publish" | "remove" }) =>
      client.v1.reports.decide({ id: asked.report.id, decision: asked.decision }),
    onSuccess: async (done) => {
      toast.success(done.state === "published" ? m.reports_shown() : m.reports_removed());
      await decided();
    },
    onError: async (error) => {
      toast.error(error.message);
      // The report was deleted by its author meanwhile, or decided elsewhere: it is read again.
      await decided();
    },
  });

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-s">
        <p className="max-w-(--container-3xl) text-neutral-7">{m.reports_intro()}</p>
        <Tabs value={filter} onValueChange={(value) => onFilterChange(value as ReportFilter)}>
          <TabsList variant="segment" aria-label={m.reports_filter()}>
            {REPORT_FILTERS.map((one) => (
              <TabsTab key={one} value={one}>
                {FILTER_NAMES[one]()}
              </TabsTab>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {!reports ? (
        <Loader />
      ) : reports.length === 0 ? (
        <p className="text-neutral-7">{EMPTY[filter]()}</p>
      ) : (
        <ul className="grid gap-m">
          {reports.map((report) => (
            <Card
              key={report.id}
              report={report}
              now={now}
              isBusy={decide.isPending}
              onShow={() => ask(report, "publish")}
              onRemove={() => ask(report, "remove")}
            />
          ))}
        </ul>
      )}
      {onMore && (
        <div>
          <Button variant="outline" isPending={isLoadingMore} onClick={onMore}>
            {m.reports_more()}
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={isAsking}
        onOpenChange={setAsking}
        title={deciding?.decision === "publish" ? m.reports_show_title() : m.reports_remove_title()}
        body={
          deciding?.decision === "publish"
            ? m.reports_show_body({ name: deciding.report.breakName })
            : m.reports_remove_body()
        }
        confirmLabel={deciding?.decision === "publish" ? m.reports_show() : m.reports_remove()}
        variant={deciding?.decision === "publish" ? "default" : "destructive"}
        onConfirm={() => (deciding ? decide.mutateAsync(deciding) : Promise.resolve())}
      />
    </>
  );
}
