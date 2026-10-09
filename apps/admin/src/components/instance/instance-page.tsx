import { Badge } from "@repo/ui/components/ui/badge";
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
import type { InstanceState, Job } from "@/lib/api";
import { formatAgo, formatBytes, formatCount, formatDuration } from "@/lib/format";
import { m } from "@/paraglide/messages.js";

import { cadence, countPhrases, failureSentence, STATE_LABELS, STATE_VARIANTS } from "./job-words";

const DAY_MS = 24 * 60 * 60 * 1000;

// The ways out of the instance's mail, by the name each is known by.
const MAIL_WAYS = { unosend: "Unosend", smtp: "SMTP" } as const;

type ForecastBucket = InstanceState["forecasts"]["calls"][number]["bucket"];

// The counts of requests to the forecast provider, in the order the API gives them.
const FORECAST_BUCKETS: ForecastBucket[] = ["day:people", "day:alerts", "hour", "minute"];
const BUCKET_LABELS: Record<ForecastBucket, () => string> = {
  "day:people": m.forecast_calls_people,
  "day:alerts": m.forecast_calls_alerts,
  hour: m.forecast_calls_hour,
  minute: m.forecast_calls_minute,
};

type InstancePageProps = {
  // Undefined while it loads.
  state: InstanceState | undefined;
  now: number;
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

type Worker = InstanceState["workers"][number];

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

/** The state of the instance: its programs, what each job of the worker last did, its data. */
export function InstancePage({ state, now }: InstancePageProps) {
  // An API of the version before this page's says nothing of forecasts: the admin and the API
  // are not deployed together, and the section waits rather than fail.
  const forecasts = state?.forecasts as InstanceState["forecasts"] | undefined;
  const mail = state?.mail as InstanceState["mail"] | undefined;
  return (
    <>
      <h1 className="text-l font-medium">{m.nav_instance()}</h1>

      <dl className="grid gap-x-l gap-y-m sm:grid-cols-[repeat(auto-fit,minmax(14rem,1fr))]">
        <Fact label={m.instance_worker()}>
          {state ? (
            <WorkerFact workers={state.workers} now={now} />
          ) : (
            <Skeleton className="h-6 w-40" />
          )}
        </Fact>
        <Fact label={m.instance_api()}>
          {state ? (
            m.started_ago({ ago: formatAgo(state.api.startedAt, now) })
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
                    <ProcessState worker={worker} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}
    </>
  );
}
