import type { Job, JobFailure } from "@/lib/api";
import { formatCount } from "@/lib/format";
import { m } from "@/paraglide/messages.js";

/** Where a job is, in a word. */
export const STATE_LABELS: Record<Job["state"], () => string> = {
  waiting: m.job_waiting,
  running: m.job_running,
  succeeded: m.job_succeeded,
  degraded: m.job_degraded,
  failed: m.job_failed,
  expired: m.job_expired,
  late: m.job_late,
};

export const STATE_VARIANTS: Record<Job["state"], "neutral" | "success" | "warning" | "error"> = {
  waiting: "neutral",
  running: "neutral",
  succeeded: "success",
  degraded: "warning",
  failed: "error",
  expired: "error",
  late: "error",
};

// The numbers a job returns, by the name the worker gives them. One it gives tomorrow is shown
// under that name until it has words here.
const COUNT_LABELS: Record<string, (count: { count: string }) => string> = {
  stations: m.count_stations,
  newReadings: m.count_new_readings,
  completedReadings: m.count_completed_readings,
  failedStations: m.count_failed_stations,
  rejected: m.count_rejected,
  deleted: m.count_deleted,
  open: m.count_open,
  sheltered: m.count_sheltered,
  changed: m.count_changed,
  spots: m.count_spots,
  created: m.count_created,
  failed: m.count_failed,
  listed: m.count_listed,
  added: m.count_added,
  removed: m.count_removed,
  kept: m.count_kept,
  leftOut: m.count_left_out,
};

/**
 * What a job did, one phrase for each number it returned: in the order of the list above, since
 * the database keeps none, and without the zeros after the first, which say nothing.
 */
export function countPhrases(counts: Record<string, number>) {
  const order = Object.keys(COUNT_LABELS);
  const place = (name: string) => (order.includes(name) ? order.indexOf(name) : order.length);
  return Object.entries(counts)
    .sort(([a], [b]) => place(a) - place(b) || a.localeCompare(b))
    .filter(([, value], index) => index === 0 || value !== 0)
    .map(([name, value]) => {
      const count = formatCount(value);
      // A name that the list does not have, `constructor` among them, is shown as it is.
      const label = Object.hasOwn(COUNT_LABELS, name) ? COUNT_LABELS[name] : undefined;
      return label?.({ count }) ?? `${name} ${count}`;
    });
}

/** What failed, from the kind the instance kept of it. The error's own text is not kept. */
export function failureSentence(failure: JobFailure) {
  switch (failure.kind) {
    case "provider": {
      const host = failure.host ?? m.failure_unknown_host();
      return failure.status === undefined
        ? m.failure_provider_silent({ host })
        : m.failure_provider_status({ host, status: failure.status });
    }
    case "format":
      return m.failure_format();
    case "database":
      return m.failure_database();
    case "expired":
      return m.failure_expired();
    case "stopped":
      return m.failure_stopped();
    case "other":
      return m.failure_other();
  }
}

/** How often a schedule runs a job, from the longest time it leaves between two runs. */
export function cadence(everySeconds: number) {
  const minutes = Math.round(everySeconds / 60);
  if (minutes < 60) return m.every_minutes({ count: minutes });
  if (minutes === 60) return m.every_hour();
  if (minutes === 24 * 60) return m.every_day();
  if (minutes === 7 * 24 * 60) return m.every_week();
  if (minutes % (24 * 60) === 0) return m.every_days({ count: minutes / (24 * 60) });
  return m.every_hours({ count: Math.round(minutes / 6) / 10 });
}
