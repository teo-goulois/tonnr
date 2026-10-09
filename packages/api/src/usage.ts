import { ORPCError } from "@orpc/server";
import type { Database } from "@repo/db";
import {
  apiKey,
  apiUsage,
  developerCalls,
  type USAGE_OUTCOMES,
  type USAGE_VIA,
} from "@repo/db/schema/access";
import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";

export type Via = (typeof USAGE_VIA)[number];
export type Outcome = (typeof USAGE_OUTCOMES)[number];

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
// How long a count is kept after its hour.
const KEPT_MONTHS = 13;
// How many rows one statement writes: six values a row, and a statement takes 65,535 of them.
const ROWS_A_WRITE = 5000;

/** One run of a procedure, as it is counted. */
export type Call = {
  via: Via;
  // The key the request named, when the instance knows it.
  keyId: string | null;
  procedure: string;
  outcome: Outcome;
  // Whether the key worked: a call notes a key's last use only then.
  worked?: boolean;
};

export type Usage = {
  /** Counts one run of a procedure, in memory. It never fails and never waits. */
  count(call: Call): void;
  /**
   * Writes what was counted since the last write, and deletes the counts that are too old when
   * the hour has turned. It never fails: what it could not write is lost, and the log says so.
   */
  flush(): Promise<void>;
  /** Stops writing on a timer, and writes what is left. */
  stop(): Promise<void>;
};

type Options = {
  // How often to write, in milliseconds. Null: only when `flush` is called.
  every?: number | null;
  now?: () => Date;
};

/**
 * The moment so many months before another, UTC's, at the same day of the month and the same
 * hour. A month that has no such day gives its last one: thirteen months before the 31st of
 * March is the 28th of February, and not a day of March.
 */
export function monthsBefore(moment: Date, months: number) {
  const before = new Date(moment);
  // From the first of the month, so that the month does not run over into the next.
  before.setUTCDate(1);
  before.setUTCMonth(before.getUTCMonth() - months);
  const lastDay = new Date(
    Date.UTC(before.getUTCFullYear(), before.getUTCMonth() + 1, 0),
  ).getUTCDate();
  before.setUTCDate(Math.min(moment.getUTCDate(), lastDay));
  return before;
}

/**
 * What came of a call, from what the procedure threw. Decision 020 has the table: a caller that
 * is not accepted, a call over the limit, another fault of the caller's, or a fault of the
 * instance's.
 */
export function outcomeOf(error: unknown): Outcome {
  if (!(error instanceof ORPCError)) return "failed";
  if (error.code === "UNAUTHORIZED" || error.code === "FORBIDDEN") return "refused";
  if (error.code === "TOO_MANY_REQUESTS") return "limited";
  return error.status < 500 ? "invalid" : "failed";
}

/**
 * Counts the calls in memory and writes them to `api_usage` every thirty seconds, so that no
 * call waits on a write. The counts are approximate by design: decision 020 says what is lost,
 * and why a write that failed is not sent again.
 */
export function createUsage(db: Database, options: Options = {}): Usage {
  const now = options.now ?? (() => new Date());
  const every = options.every === undefined ? 30 * 1000 : options.every;

  type Counted = Omit<Call, "worked"> & { hour: number; calls: number };
  let counts = new Map<string, Counted>();
  // The minute each key was last used while it worked.
  let lastUsed = new Map<string, number>();
  // The hour of the last deletion. Null until the first one.
  let prunedAt: number | null = null;
  // One write at a time: the timer, a stop and a caller of `flush` may all ask for one.
  let writing = Promise.resolve();

  async function write(batch: Counted[], used: Map<string, number>) {
    // A key that was deleted since its call would have the database refuse the whole write.
    const named = [...new Set(batch.flatMap((row) => (row.keyId === null ? [] : [row.keyId])))];
    const known = new Set(
      named.length === 0
        ? []
        : (await db.select({ id: apiKey.id }).from(apiKey).where(inArray(apiKey.id, named))).map(
            (row) => row.id,
          ),
    );
    const rows = batch
      .filter((row) => row.keyId === null || known.has(row.keyId))
      .map(({ hour, ...row }) => ({ ...row, hour: new Date(hour) }));

    await db.transaction(async (tx) => {
      for (let start = 0; start < rows.length; start += ROWS_A_WRITE) {
        await tx
          .insert(apiUsage)
          .values(rows.slice(start, start + ROWS_A_WRITE))
          .onConflictDoUpdate({
            target: [
              apiUsage.hour,
              apiUsage.via,
              apiUsage.keyId,
              apiUsage.procedure,
              apiUsage.outcome,
            ],
            set: { calls: sql`${apiUsage.calls} + excluded.calls` },
          });
      }
      for (const [id, minute] of used) {
        const at = new Date(minute);
        // Another process may have noted a later use: the time only moves forward.
        await tx
          .update(apiKey)
          .set({ lastUsedAt: at })
          .where(and(eq(apiKey.id, id), or(isNull(apiKey.lastUsedAt), lt(apiKey.lastUsedAt, at))));
      }
    });
  }

  async function prune(hour: number) {
    const before = monthsBefore(new Date(hour), KEPT_MONTHS);
    await db.delete(apiUsage).where(lt(apiUsage.hour, before));
    await db.delete(developerCalls).where(lt(developerCalls.hour, before));
    prunedAt = hour;
  }

  async function flushOnce() {
    const batch = [...counts.values()];
    const used = lastUsed;
    counts = new Map();
    lastUsed = new Map();

    if (batch.length > 0) {
      try {
        await write(batch, used);
      } catch (error) {
        // Not sent again: the database may have kept it, and a second time would count it twice.
        const lost = batch.reduce((sum, row) => sum + row.calls, 0);
        console.error(`usage: ${lost} calls were counted and could not be written`, error);
      }
    }

    const hour = Math.floor(now().getTime() / HOUR_MS) * HOUR_MS;
    if (prunedAt !== hour) {
      try {
        await prune(hour);
      } catch (error) {
        console.error("usage: the old counts could not be deleted", error);
      }
    }
  }

  const flush = () => {
    writing = writing.then(flushOnce);
    return writing;
  };

  // The timer does not keep the process alive on its own.
  const timer = every === null ? null : setInterval(() => void flush(), every);
  timer?.unref();

  return {
    count({ via, keyId, procedure, outcome, worked = false }) {
      const at = now().getTime();
      const hour = Math.floor(at / HOUR_MS) * HOUR_MS;
      const bucket = [hour, via, keyId ?? "", procedure, outcome].join("\n");
      const counted = counts.get(bucket);
      if (counted) counted.calls += 1;
      else counts.set(bucket, { hour, via, keyId, procedure, outcome, calls: 1 });

      if (keyId !== null && worked) {
        lastUsed.set(keyId, Math.floor(at / MINUTE_MS) * MINUTE_MS);
      }
    },
    flush,
    async stop() {
      if (timer) clearInterval(timer);
      await flush();
    },
  };
}
