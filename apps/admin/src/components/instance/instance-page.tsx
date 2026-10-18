import { Badge } from "@repo/ui/components/ui/badge";
import { Button } from "@repo/ui/components/ui/button";
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

import { CallsMeter } from "@/components/shared/calls-meter";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import type { InstanceState, Job } from "@/lib/api";
import { formatAgo, formatBytes, formatCount, formatDuration } from "@/lib/format";
import { m } from "@/paraglide/messages.js";

import { cadence, countPhrases, failureSentence, STATE_LABELS, STATE_VARIANTS } from "./job-words";

const DAY_MS = 24 * 60 * 60 * 1000;

// The ways out of the instance's mail, by the name each is known by.
const MAIL_WAYS = { unosend: "Unosend", smtp: "SMTP" } as const;

type ForecastBucket = InstanceState["forecasts"]["calls"][number]["bucket"];

// The counts of requests to the forecast provider, in the order the API gives them.
const FORECAST_BUCKETS: ForecastBucket[] = [
  "day:people",
  "day:pages",
  "day:alerts",
  "hour",
  "minute",
];
const BUCKET_LABELS: Record<ForecastBucket, () => string> = {
  "day:people": m.forecast_calls_people,
  "day:pages": m.forecast_calls_pages,
  "day:alerts": m.forecast_calls_alerts,
  hour: m.forecast_calls_hour,
  minute: m.forecast_calls_minute,
};

type InstancePageProps = {
  // Undefined while it loads.
  state: InstanceState | undefined;
  now: number;
  // The dialog that is asked for: the one that closes the app to visitors, or the one that
  // opens it to them. It shows only while the instance does the other.
  askingVisitors: "close" | "open" | undefined;
  onAskingVisitorsChange: (asking: "close" | "open" | undefined) => void;
  // Closes the instance to the visitors of its web app, or opens it. Rejects when it fails.
  onVisitorsChange: (open: boolean) => Promise<unknown>;
  // The dialog that turns the web app's error reports off, or the one that turns them on.
  askingErrors: "off" | "on" | undefined;
  onAskingErrorsChange: (asking: "off" | "on" | undefined) => void;
  // Turns the web app's error reports off for every browser, or on. Rejects when it fails.
  onErrorsChange: (on: boolean) => Promise<unknown>;
  // The dialog that stops the uploads of photos and videos, or the one that starts them again.
  askingMedia: "off" | "on" | undefined;
  onAskingMediaChange: (asking: "off" | "on" | undefined) => void;
  // Stops every upload of photos and videos, or starts them again. Rejects when it fails.
  onMediaChange: (on: boolean) => Promise<unknown>;
};

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid content-start gap-xxs">
      <dt className="text-s text-neutral-7">{label}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  );
}

function Loading({ columns }: { columns: number }) {
  return [0, 1, 2].map((row) => (
    <TableRow key={row}>
      <TableCell colSpan={columns}>
        <Skeleton className="h-5 w-full" />
      </TableCell>
    </TableRow>
  ));
}

/** What a job's last attempt did, or what failed, or that it has not run yet. */
function LastAttempt({ job, now }: { job: Job; now: number }) {
  if (!job.startedAt) return <span className="text-neutral-7">{m.job_never_ran()}</span>;

  const lasted =
    job.finishedAt === null
      ? null
      : formatDuration(job.finishedAt.getTime() - job.startedAt.getTime());
  return (
    <div className="grid gap-xxs">
      <span className="whitespace-nowrap">
        {formatAgo(job.startedAt, now)}
        {lasted && <span className="text-neutral-7"> · {lasted}</span>}
      </span>
      {job.failure && <span className="text-s text-neutral-7">{failureSentence(job.failure)}</span>}
      {job.counts && Object.keys(job.counts).length > 0 && (
        <span className="text-s text-neutral-7">{countPhrases(job.counts).join(" · ")}</span>
      )}
      {/* A job that works again still says what failed, for a day. */}
      {!job.failure &&
        job.lastFailure &&
        job.lastFailureAt &&
        now - job.lastFailureAt.getTime() < DAY_MS && (
          <span className="text-s text-neutral-7">
            {m.job_failed_ago({
              ago: formatAgo(job.lastFailureAt, now),
              what: failureSentence(job.lastFailure),
            })}
          </span>
        )}
    </div>
  );
}

/** What the bucket keeps, in a line: "128 kept · 1.2 GB · 3 waiting". */
function keptPhrases(media: InstanceState["media"]) {
  return [
    m.media_kept({ count: formatCount(media.ready) }),
    formatBytes(media.bytes),
    ...(media.waiting > 0 ? [m.media_waiting({ count: formatCount(media.waiting) })] : []),
    ...(media.failed > 0 ? [m.media_failed({ count: formatCount(media.failed) })] : []),
  ];
}

type Worker = InstanceState["workers"][number];

/** The commit a process's image was built from, by its first seven characters. */
function Revision({ of }: { of: string | null }) {
  if (!of) return <span className="block text-s text-neutral-7">{m.revision_unknown()}</span>;
  return (
    <code className="block font-mono text-s text-neutral-7" title={of}>
      {of.slice(0, 7)}
    </code>
  );
}

/** Where a worker process is: one that says it is there and is not ready yet is starting. */
function ProcessState({ worker }: { worker: Worker }) {
  if (worker.running) {
    return worker.readyAt ? (
      <Badge variant="success">{m.program_running()}</Badge>
    ) : (
      <Badge>{m.program_starting()}</Badge>
    );
  }
  return worker.readyAt ? (
    <Badge>{m.program_stopped()}</Badge>
  ) : (
    <Badge variant="error">{m.process_never_ready()}</Badge>
  );
}

/**
 * The worker in a line. The API lists its processes with the latest to start first: one that
 * runs speaks for the worker, a ready one before one that starts. With none, the latest says
 * whether the worker stopped or does not get as far as being ready.
 */
function WorkerFact({ workers, now }: { workers: Worker[]; now: number }) {
  const running = workers.filter((worker) => worker.running);
  const shown = running.find((worker) => worker.readyAt) ?? running[0];
  if (shown) {
    return (
      <span className="flex flex-wrap items-center gap-xs">
        <ProcessState worker={shown} />
        {m.started_ago({ ago: formatAgo(shown.startedAt, now) })}
      </span>
    );
  }

  const latest = workers[0];
  if (latest && !latest.readyAt) {
    return (
      <span className="flex flex-wrap items-center gap-xs">
        <Badge variant="error">{m.program_not_starting()}</Badge>
        {m.tried_ago({ ago: formatAgo(latest.startedAt, now) })}
      </span>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-xs">
      <Badge variant="error">{m.program_stopped()}</Badge>
      {latest ? m.seen_ago({ ago: formatAgo(latest.seenAt, now) }) : m.worker_never_seen()}
    </span>
  );
}

/**
 * The state of the instance: its programs, what each job of the worker last did, its data,
 * whether it answers the visitors of its web app, whether the web app sends error reports and
 * whether accounts send photos and videos, which an operator changes here.
 */
export function InstancePage({
  state,
  now,
  askingVisitors,
  onAskingVisitorsChange,
  onVisitorsChange,
  askingErrors,
  onAskingErrorsChange,
  onErrorsChange,
  askingMedia,
  onAskingMediaChange,
  onMediaChange,
}: InstancePageProps) {
  // An API of the version before this page's says nothing of forecasts: the admin and the API
  // are not deployed together, and the section waits rather than fail.
  const forecasts = state?.forecasts as InstanceState["forecasts"] | undefined;
  const mail = state?.mail as InstanceState["mail"] | undefined;
  const visitors = state?.visitors as InstanceState["visitors"] | undefined;
  // No operator closed the instance to visitors. It may still answer none, by itself, while
  // demand is strong. An API of the version before says nothing of that.
  const isOpen = visitors?.closedAt === null;
  const isBusy = isOpen && visitors.busy === true;
  const closesAt = (visitors?.closesAt as number | undefined) ?? null;
  const errors = state?.errorReports as InstanceState["errorReports"] | undefined;
  const errorsOn = errors?.pausedAt === null;
  // An API of the version before says nothing of the photos and videos either.
  const media = state?.media as InstanceState["media"] | undefined;
  const uploadsOn = media?.pausedAt === null;
  return (
    <>
      <h1 className="text-l font-medium">{m.nav_instance()}</h1>

      <dl className="grid gap-x-l gap-y-m sm:grid-cols-[repeat(auto-fit,minmax(14rem,1fr))]">
        <Fact label={m.instance_visitors()}>
          {!visitors ? (
            <Skeleton className="h-6 w-40" />
          ) : (
            <span className="grid justify-items-start gap-xs">
              <span className="flex flex-wrap items-center gap-xs">
                <Badge variant={isOpen && !isBusy ? "success" : "warning"}>
                  {!isOpen ? m.visitors_closed() : isBusy ? m.visitors_busy() : m.visitors_open()}
                </Badge>
                <span className="text-s text-neutral-7">
                  {visitors.closedAt
                    ? m.visitors_closed_note({ ago: formatAgo(visitors.closedAt, now) })
                    : isBusy
                      ? m.visitors_busy_note({ count: formatCount(closesAt ?? 0) })
                      : m.visitors_open_note()}
                </span>
              </span>
              {isOpen && !isBusy && closesAt !== null && (
                <span className="text-s text-neutral-7">
                  {m.visitors_auto_note({ count: formatCount(closesAt) })}
                </span>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => onAskingVisitorsChange(isOpen ? "close" : "open")}
              >
                {isOpen ? m.visitors_close() : m.visitors_reopen()}
              </Button>
            </span>
          )}
        </Fact>
        <Fact label={m.instance_errors()}>
          {!errors ? (
            <Skeleton className="h-6 w-40" />
          ) : (
            <span className="grid justify-items-start gap-xs">
              <span className="flex flex-wrap items-center gap-xs">
                <Badge variant={errorsOn ? "success" : "warning"}>
                  {errorsOn ? m.errors_on() : m.errors_off()}
                </Badge>
                <span className="text-s text-neutral-7">
                  {errors.pausedAt
                    ? m.errors_off_note({ ago: formatAgo(errors.pausedAt, now) })
                    : m.errors_on_note()}
                </span>
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onAskingErrorsChange(errorsOn ? "off" : "on")}
              >
                {errorsOn ? m.errors_turn_off() : m.errors_turn_on()}
              </Button>
            </span>
          )}
        </Fact>
        <Fact label={m.instance_media()}>
          {!media ? (
            <Skeleton className="h-6 w-40" />
          ) : !media.offered ? (
            <span className="grid gap-xxs">
              {m.media_none()}
              <span className="text-s text-neutral-7">{m.media_none_note()}</span>
            </span>
          ) : (
            <span className="grid justify-items-start gap-xs">
              <span className="flex flex-wrap items-center gap-xs">
                <Badge variant={uploadsOn ? "success" : "warning"}>
                  {uploadsOn ? m.media_on() : m.media_off()}
                </Badge>
                <span className="text-s text-neutral-7">
                  {media.pausedAt
                    ? m.media_off_note({ ago: formatAgo(media.pausedAt, now) })
                    : m.media_on_note()}
                </span>
              </span>
              <span className="tabular-nums">{keptPhrases(media).join(" · ")}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onAskingMediaChange(uploadsOn ? "off" : "on")}
              >
                {uploadsOn ? m.media_turn_off() : m.media_turn_on()}
              </Button>
            </span>
          )}
        </Fact>
        <Fact label={m.instance_worker()}>
          {state ? (
            <WorkerFact workers={state.workers} now={now} />
          ) : (
            <Skeleton className="h-6 w-40" />
          )}
        </Fact>
        <Fact label={m.instance_api()}>
          {state ? (
            <>
              {m.started_ago({ ago: formatAgo(state.api.startedAt, now) })}
              <Revision of={state.api.revision} />
            </>
          ) : (
            <Skeleton className="h-6 w-40" />
          )}
        </Fact>
        <Fact label={m.instance_database()}>
          {state ? formatBytes(state.database.sizeBytes) : <Skeleton className="h-6 w-24" />}
        </Fact>
        <Fact label={m.instance_usage()}>
          {!state ? (
            <Skeleton className="h-6 w-40" />
          ) : (
            <span className="grid gap-xxs">
              {state.api.usageWrittenAt
                ? m.usage_written_ago({ ago: formatAgo(state.api.usageWrittenAt, now) })
                : m.usage_not_written()}
              {state.api.usageLostCalls > 0 && (
                <span className="flex flex-wrap items-center gap-xs text-s">
                  <Badge variant="warning">{m.usage_lost_badge()}</Badge>
                  {m.usage_lost({ count: formatCount(state.api.usageLostCalls) })}
                </span>
              )}
            </span>
          )}
        </Fact>
        <Fact label={m.instance_mail()}>
          {!mail ? (
            <Skeleton className="h-6 w-40" />
          ) : mail.via === null ? (
            <span className="grid gap-xxs">
              {m.mail_off()}
              <span className="text-s text-neutral-7">{m.mail_off_note()}</span>
            </span>
          ) : (
            <span className="grid gap-xxs">
              <CallsMeter
                calls={mail.today}
                limit={mail.dailyLimit}
                label={m.mail_today({ via: MAIL_WAYS[mail.via] })}
              />
              <span className="text-s text-neutral-7">
                {m.mail_today({ via: MAIL_WAYS[mail.via] })}
              </span>
            </span>
          )}
        </Fact>
        <Fact label={m.instance_web_origin()}>
          {state ? (
            <code className="font-mono text-s">{state.api.webOrigin}</code>
          ) : (
            <Skeleton className="h-6 w-48" />
          )}
        </Fact>
        <Fact label={m.instance_admin_site()}>
          {state ? (
            <code className="font-mono text-s">{state.api.adminSites.join(", ")}</code>
          ) : (
            <Skeleton className="h-6 w-48" />
          )}
        </Fact>
      </dl>

      <section className="grid grid-cols-1 gap-s">
        <h2 className="text-m font-medium">{m.instance_jobs()}</h2>
        {state?.jobs.length === 0 ? (
          <p className="max-w-(--container-2xl) text-s text-neutral-7">{m.jobs_empty()}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{m.job_name()}</TableHead>
                <TableHead>{m.state()}</TableHead>
                <TableHead>{m.job_last_attempt()}</TableHead>
                <TableHead>{m.job_last_success()}</TableHead>
                <TableHead>{m.job_schedule()}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state ? (
                state.jobs.map((job) => (
                  <TableRow key={job.name}>
                    <TableCell className="font-mono whitespace-nowrap">{job.name}</TableCell>
                    <TableCell>
                      <span className="flex flex-wrap items-center gap-xs">
                        <Badge variant={STATE_VARIANTS[job.state]}>
                          {STATE_LABELS[job.state]()}
                        </Badge>
                        {job.failuresInARow > 1 && (
                          <span className="text-s whitespace-nowrap text-neutral-7">
                            {m.job_failures_in_a_row({ count: formatCount(job.failuresInARow) })}
                          </span>
                        )}
                      </span>
                    </TableCell>
                    {/* Wide enough on a phone, where the table slides, for its lines to be read. */}
                    <TableCell className="min-w-64">
                      <LastAttempt job={job} now={now} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-neutral-7">
                      {job.lastSuccessAt ? formatAgo(job.lastSuccessAt, now) : m.never()}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-neutral-7">
                      {cadence(job.everySeconds)}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <Loading columns={5} />
              )}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="grid grid-cols-1 gap-s">
        <div className="grid gap-xxs">
          <h2 className="text-m font-medium">{m.instance_forecasts()}</h2>
          <p className="max-w-(--container-2xl) text-s text-neutral-7">{m.forecasts_note()}</p>
        </div>
        <dl className="grid gap-x-l gap-y-m sm:grid-cols-[repeat(auto-fit,minmax(14rem,1fr))]">
          {(forecasts?.calls ?? FORECAST_BUCKETS).map((count) => {
            const label = BUCKET_LABELS[typeof count === "string" ? count : count.bucket]();
            return (
              <Fact key={label} label={label}>
                {typeof count === "string" ? (
                  <Skeleton className="h-8 w-40" />
                ) : (
                  <CallsMeter calls={count.calls} limit={count.limit} label={label} />
                )}
              </Fact>
            );
          })}
          <Fact label={m.forecast_cells()}>
            {forecasts ? (
              <span className="grid gap-xxs">
                <span className="tabular-nums">{formatCount(forecasts.cells)}</span>
                <span className="text-s text-neutral-7">{m.forecast_cells_note()}</span>
              </span>
            ) : (
              <Skeleton className="h-6 w-24" />
            )}
          </Fact>
        </dl>
      </section>

      <section className="grid grid-cols-1 gap-s">
        <div className="grid gap-xxs">
          <h2 className="text-m font-medium">{m.instance_providers()}</h2>
          <p className="max-w-(--container-2xl) text-s text-neutral-7">{m.providers_note()}</p>
        </div>
        {state?.providers.length === 0 ? (
          <p className="text-s text-neutral-7">{m.providers_empty()}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{m.provider_name()}</TableHead>
                <TableHead className="text-right">{m.provider_stations()}</TableHead>
                <TableHead className="text-right">{m.provider_recent()}</TableHead>
                <TableHead>{m.provider_latest()}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state ? (
                state.providers.map((provider) => (
                  <TableRow key={provider.id}>
                    <TableCell className="font-mono">{provider.id}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCount(provider.stations)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCount(provider.recent)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-neutral-7">
                      {provider.latestReadingAt
                        ? formatAgo(provider.latestReadingAt, now)
                        : m.never()}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <Loading columns={4} />
              )}
            </TableBody>
          </Table>
        )}
      </section>

      {state && state.workers.length > 1 && (
        <section className="grid grid-cols-1 gap-s">
          <div className="grid gap-xxs">
            <h2 className="text-m font-medium">{m.instance_processes()}</h2>
            <p className="max-w-(--container-2xl) text-s text-neutral-7">{m.processes_note()}</p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{m.process_started()}</TableHead>
                <TableHead>{m.process_seen()}</TableHead>
                <TableHead>{m.process_revision()}</TableHead>
                <TableHead>{m.state()}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.workers.map((worker) => (
                <TableRow key={worker.id}>
                  <TableCell className="whitespace-nowrap">
                    {formatAgo(worker.startedAt, now)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-neutral-7">
                    {formatAgo(worker.seenAt, now)}
                  </TableCell>
                  <TableCell>
                    <Revision of={worker.revision} />
                  </TableCell>
                  <TableCell>
                    <ProcessState worker={worker} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}

      {/* One dialog for each way, so that neither changes its words while it closes: the
          instance does the other by then. */}
      <ConfirmDialog
        open={askingVisitors === "close" && visitors?.closedAt === null}
        onOpenChange={(open) => onAskingVisitorsChange(open ? "close" : undefined)}
        title={m.visitors_close_title()}
        body={m.visitors_close_body()}
        confirmLabel={m.visitors_close()}
        onConfirm={() => onVisitorsChange(false)}
      />
      <ConfirmDialog
        open={askingVisitors === "open" && visitors != null && visitors.closedAt !== null}
        onOpenChange={(open) => onAskingVisitorsChange(open ? "open" : undefined)}
        title={m.visitors_open_title()}
        body={m.visitors_open_body()}
        confirmLabel={m.visitors_reopen()}
        variant="default"
        onConfirm={() => onVisitorsChange(true)}
      />
      <ConfirmDialog
        open={askingErrors === "off" && errors?.pausedAt === null}
        onOpenChange={(open) => onAskingErrorsChange(open ? "off" : undefined)}
        title={m.errors_off_title()}
        body={m.errors_off_body()}
        confirmLabel={m.errors_turn_off()}
        onConfirm={() => onErrorsChange(false)}
      />
      <ConfirmDialog
        open={askingErrors === "on" && errors != null && errors.pausedAt !== null}
        onOpenChange={(open) => onAskingErrorsChange(open ? "on" : undefined)}
        title={m.errors_on_title()}
        body={m.errors_on_body()}
        confirmLabel={m.errors_turn_on()}
        variant="default"
        onConfirm={() => onErrorsChange(true)}
      />
      <ConfirmDialog
        open={askingMedia === "off" && media?.offered === true && media.pausedAt === null}
        onOpenChange={(open) => onAskingMediaChange(open ? "off" : undefined)}
        title={m.media_off_title()}
        body={m.media_off_body()}
        confirmLabel={m.media_turn_off()}
        onConfirm={() => onMediaChange(false)}
      />
      <ConfirmDialog
        open={askingMedia === "on" && media?.offered === true && media.pausedAt !== null}
        onOpenChange={(open) => onAskingMediaChange(open ? "on" : undefined)}
        title={m.media_on_title()}
        body={m.media_on_body()}
        confirmLabel={m.media_turn_on()}
        variant="default"
        onConfirm={() => onMediaChange(true)}
      />
    </>
  );
}
