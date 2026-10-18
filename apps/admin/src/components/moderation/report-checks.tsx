import { Badge } from "@repo/ui/components/ui/badge";
import { Dialog, DialogPopup, DialogTitle } from "@repo/ui/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/ui/table";
import { CheckIcon, PlayIcon, TriangleAlertIcon, XIcon } from "@repo/ui/icon";
import { type ReactNode, useState } from "react";

import type { MediaChecks, ReportMedium, ReportReason, ReviewedReport } from "@/lib/api";
import {
  formatCount,
  formatDayAndHour,
  formatDuration,
  formatKilometres,
  formatMinutes,
  formatShare,
} from "@/lib/format";
import { m } from "@/paraglide/messages.js";

// What the worker checked of each photo and video of a report, one row each: where it was taken,
// when, what the analysis saw in it, and what that came to. Decision 067. The admin judges
// nothing itself: each mark is a reason the worker wrote, or its absence.

/** Why a photo or a video is not shown, in a few words. */
export const REASONS: Record<ReportReason, () => string> = {
  no_position: m.reports_reason_no_position,
  too_far: m.reports_reason_too_far,
  imprecise: m.reports_reason_imprecise,
  no_time: m.reports_reason_no_time,
  too_old: m.reports_reason_too_old,
  ahead: m.reports_reason_ahead,
  not_sea: m.reports_reason_not_sea,
  nudity: m.reports_reason_nudity,
  unsure: m.reports_reason_unsure,
  unreadable: m.reports_reason_unreadable,
};

const FAILURES: Record<NonNullable<ReportMedium["failure"]>, () => string> = {
  unreadable: m.reports_reason_unreadable,
  too_large: m.reports_failure_too_large,
  too_long: m.reports_failure_too_long,
  changed: m.reports_failure_changed,
  gave_up: m.reports_failure_gave_up,
};

const VERDICTS: Record<
  MediaChecks["verdict"],
  { label: () => string; variant: "success" | "error" | "warning" }
> = {
  passed: { label: m.reports_verdict_passed, variant: "success" },
  refused: { label: m.reports_verdict_refused, variant: "error" },
  review: { label: m.reports_verdict_review, variant: "warning" },
};

const TIME_SOURCES: Record<NonNullable<MediaChecks["time"]["source"]>, () => string> = {
  gps: m.reports_time_source_gps,
  offset: m.reports_time_source_offset,
  local: m.reports_time_source_local,
  video: m.reports_time_source_video,
  sent: m.reports_time_source_sent,
};

const linked = "focus-ring w-fit rounded-xs underline underline-offset-2 hover:text-neutral-10";

// The place on OpenStreetMap, to see where it was taken.
function mapOf({ latitude, longitude }: { latitude: number; longitude: number }) {
  return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=15/${latitude}/${longitude}`;
}

type Mark = "passed" | "failed" | "unsure";

const MARKS: Record<Mark, { icon: ReactNode; said: () => string }> = {
  passed: { icon: <CheckIcon className="size-4 text-success" />, said: m.reports_mark_passed },
  failed: { icon: <XIcon className="size-4 text-error" />, said: m.reports_mark_failed },
  unsure: {
    icon: <TriangleAlertIcon className="size-4 text-warning" />,
    said: m.reports_mark_unsure,
  },
};

/** What a check came to, marked, in a sentence with its figure. */
function Outcome({ outcome, children }: { outcome: Mark; children: ReactNode }) {
  return (
    <p className="flex gap-xxs">
      {/* As high as the first line of the sentence, so that the mark sits beside it. */}
      <span aria-hidden className="flex h-lh shrink-0 items-center">
        {MARKS[outcome].icon}
      </span>
      <span>
        <span className="sr-only">{MARKS[outcome].said()} </span>
        {children}
      </span>
    </p>
  );
}

function Quiet({ children }: { children: ReactNode }) {
  return <p className="text-neutral-7">{children}</p>;
}

/** Where it was taken: from the file or from the phone, how far from the break. */
function Position({ check }: { check: MediaChecks["position"] }) {
  const distance = check.distanceKm === null ? null : formatKilometres(check.distanceKm);
  const source =
    check.source === "file"
      ? m.reports_position_source_file()
      : check.source === "device"
        ? check.accuracyM === null
          ? m.reports_position_source_device_rough()
          : m.reports_position_source_device({ meters: formatCount(check.accuracyM) })
        : null;
  return (
    <div className="grid gap-xxs">
      {check.reason === "no_position" ? (
        <Outcome outcome="failed">{m.reports_reason_no_position()}</Outcome>
      ) : check.reason === "too_far" ? (
        <Outcome outcome="failed">{m.reports_position_far({ distance: distance ?? "" })}</Outcome>
      ) : check.reason === "imprecise" ? (
        <Outcome outcome="failed">{m.reports_reason_imprecise()}</Outcome>
      ) : (
        <Outcome outcome="passed">{m.reports_position_near({ distance: distance ?? "" })}</Outcome>
      )}
      {check.reason === "imprecise" && distance && (
        <Quiet>{m.reports_position_near({ distance })}</Quiet>
      )}
      {source && <Quiet>{source}</Quiet>}
      {check.point && (
        <a href={mapOf(check.point)} target="_blank" rel="noreferrer" className={linked}>
          {m.reports_position_map()}
        </a>
      )}
    </div>
  );
}

/** When it was taken: by which clock, and how long before it was sent. */
function Time({ check }: { check: MediaChecks["time"] }) {
  const span = check.ageMinutes === null ? "" : formatMinutes(check.ageMinutes);
  return (
    <div className="grid gap-xxs">
      {check.reason === "no_time" ? (
        <Outcome outcome="failed">{m.reports_reason_no_time()}</Outcome>
      ) : check.reason === "too_old" ? (
        <Outcome outcome="failed">{m.reports_time_old({ span })}</Outcome>
      ) : check.reason === "ahead" ? (
        <Outcome outcome="failed">{m.reports_time_ahead({ span })}</Outcome>
      ) : check.ageMinutes !== null && check.ageMinutes < 0 ? (
        // A camera's clock a little ahead is forgiven.
        <Outcome outcome="passed">{m.reports_time_after({ span })}</Outcome>
      ) : (
        <Outcome outcome="passed">{m.reports_time_before({ span })}</Outcome>
      )}
      {check.source && <Quiet>{TIME_SOURCES[check.source]()}</Quiet>}
      {check.takenAt && (
        <Quiet>{m.reports_time_taken({ at: formatDayAndHour(new Date(check.takenAt)) })}</Quiet>
      )}
    </div>
  );
}

/** What the analysis saw: the sea, nudity, and what it saw most. */
function Analysis({ checks }: { checks: MediaChecks }) {
  const { analysis, reasons } = checks;
  if (!analysis) return <Quiet>{m.reports_analysis_none()}</Quiet>;
  return (
    <div className="grid gap-xxs">
      {reasons.includes("nudity") ? (
        <Outcome outcome="failed">
          {m.reports_analysis_nudity({ score: formatShare(analysis.nudity) })}
        </Outcome>
      ) : reasons.includes("not_sea") ? (
        <Outcome outcome="failed">
          {m.reports_analysis_not_sea({ score: formatShare(analysis.sea) })}
        </Outcome>
      ) : reasons.includes("unsure") ? (
        <Outcome outcome="unsure">{m.reports_reason_unsure()}</Outcome>
      ) : (
        <Outcome outcome="passed">{m.reports_analysis_sea()}</Outcome>
      )}
      <p className="tabular-nums">
        {m.reports_analysis_scores({
          sea: formatShare(analysis.sea),
          nudity: formatShare(analysis.nudity),
        })}
      </p>
      {analysis.top.length > 0 && (
        <Quiet>
          {analysis.top
            .slice(0, 3)
            .map((seen) => `${seen.label} ${formatShare(seen.score)}`)
            .join(", ")}
        </Quiet>
      )}
      {analysis.frames > 1 && (
        <Quiet>{m.reports_analysis_frames({ count: formatCount(analysis.frames) })}</Quiet>
      )}
    </div>
  );
}

type ThumbProps = {
  medium: ReportMedium | undefined;
  onOpen: (medium: ReportMedium) => void;
};

/** The photo, or the first image of the video, which opens it whole while its file is there. */
function Thumb({ medium, onOpen }: ThumbProps) {
  const picture = medium?.thumb ?? medium?.poster ?? null;
  const whole = medium?.kind === "video" ? medium.video : medium?.display;
  const box = "relative size-20 shrink-0 overflow-hidden rounded-xs bg-neutral-3";
  if (!medium || !picture) {
    return (
      <div className={`${box} grid place-items-center p-xxs text-center text-xs text-neutral-7`}>
        {medium?.state === "processing" || medium?.state === "uploading"
          ? m.reports_medium_waiting()
          : m.reports_medium_none()}
      </div>
    );
  }
  const image = <img src={picture} alt="" decoding="async" className="size-full object-cover" />;
  if (!whole) return <div className={box}>{image}</div>;
  return (
    <button
      type="button"
      className={`${box} focus-ring cursor-zoom-in`}
      aria-label={medium.kind === "video" ? m.reports_open_video() : m.reports_open_photo()}
      onClick={() => onOpen(medium)}
    >
      {image}
      {medium.kind === "video" && (
        <span className="absolute inset-0 grid place-items-center">
          <span className="grid size-8 place-items-center rounded-full bg-neutral-10-transparent text-neutral-1">
            <PlayIcon aria-hidden className="size-4" />
          </span>
        </span>
      )}
    </button>
  );
}

/** What became of a medium: the worker's verdict, or why it could not give one. */
function Verdict({
  medium,
  checks,
}: {
  medium: ReportMedium | undefined;
  checks: MediaChecks | null;
}) {
  if (checks) {
    const verdict = VERDICTS[checks.verdict];
    return <Badge variant={verdict.variant}>{verdict.label()}</Badge>;
  }
  if (medium?.state === "failed") {
    return <Badge variant="error">{m.reports_verdict_refused()}</Badge>;
  }
  return <Badge>{m.reports_verdict_waiting()}</Badge>;
}

type ReportChecksProps = { report: ReviewedReport };

/** Each photo and video of a report, with everything that was checked of it. */
export function ReportChecks({ report }: ReportChecksProps) {
  const [opened, setOpened] = useState<ReportMedium | null>(null);

  return (
    <>
      <Table aria-label={m.reports_media()}>
        <TableHeader>
          <TableRow>
            <TableHead>{m.reports_column_file()}</TableHead>
            <TableHead>{m.reports_column_position()}</TableHead>
            <TableHead>{m.reports_column_time()}</TableHead>
            <TableHead>{m.reports_column_analysis()}</TableHead>
            <TableHead>{m.reports_column_verdict()}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {report.checked.map((checked) => {
            const medium = report.media.find((one) => one.id === checked.id);
            // The column of the database, which the API answers untyped.
            const checks = checked.checks as MediaChecks | null;
            const failure = medium?.failure ?? null;
            return (
              <TableRow key={checked.id}>
                <TableCell className="align-top">
                  <div className="grid w-fit gap-xxs">
                    <Thumb medium={medium} onOpen={setOpened} />
                    <span className="text-neutral-7">
                      {medium?.kind === "video"
                        ? medium.durationMs === null
                          ? m.reports_kind_video()
                          : m.reports_kind_video_lasting({
                              duration: formatDuration(medium.durationMs),
                            })
                        : m.reports_kind_photo()}
                    </span>
                  </div>
                </TableCell>
                {checks ? (
                  <>
                    <TableCell className="min-w-48 align-top">
                      <Position check={checks.position} />
                    </TableCell>
                    <TableCell className="min-w-48 align-top">
                      <Time check={checks.time} />
                    </TableCell>
                    <TableCell className="min-w-48 align-top">
                      <Analysis checks={checks} />
                    </TableCell>
                  </>
                ) : (
                  // A file that could not be made, or one the worker has not reached yet, was
                  // checked for nothing.
                  <TableCell colSpan={3} className="align-top">
                    {medium?.state === "failed" ? (
                      <Outcome outcome="failed">
                        {failure ? FAILURES[failure]() : m.reports_reason_unreadable()}
                      </Outcome>
                    ) : (
                      <Quiet>{m.reports_checks_waiting()}</Quiet>
                    )}
                  </TableCell>
                )}
                <TableCell className="align-top">
                  <Verdict medium={medium} checks={checks} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <Dialog open={opened !== null} onOpenChange={(open) => !open && setOpened(null)}>
        <DialogPopup className="w-full max-w-5xl gap-s p-m">
          <DialogTitle>
            {report.breakName} · {formatDayAndHour(report.createdAt)}
          </DialogTitle>
          {opened?.kind === "video" && opened.video ? (
            <video
              src={opened.video}
              poster={opened.poster ?? undefined}
              controls
              autoPlay
              playsInline
              className="max-h-[80svh] w-full rounded-xs bg-neutral-3"
            />
          ) : opened?.display ? (
            <img
              src={opened.display}
              alt=""
              decoding="async"
              className="max-h-[80svh] w-full rounded-xs object-contain"
            />
          ) : null}
        </DialogPopup>
      </Dialog>
    </>
  );
}
