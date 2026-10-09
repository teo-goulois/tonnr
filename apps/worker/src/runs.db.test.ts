import { UpstreamError } from "@repo/upstream";
import { createDb } from "@repo/db";
import { job, workerProcess } from "@repo/db/schema/instance";
import { createTestDatabase, TEST_DATABASE_URL } from "@repo/db/testing";
import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { FormatError } from "./providers/format-error";
import {
  announceWorker,
  describeFailure,
  everySecondsOf,
  jobDatabase,
  listJobs,
  recorded,
  retireJobs,
  RUN_SECONDS,
  stateDatabase,
  stoppable,
} from "./runs";
import { StoreError } from "./store";

describe("the time a schedule leaves between two runs", () => {
  const day = 24 * 3600;
  it.each([
    ["* * * * *", 60],
    ["*/10 * * * *", 600],
    ["10,40 * * * *", 1800],
    ["12 * * * *", 3600],
    ["20 */3 * * *", 3 * 3600],
    ["17 3 * * *", day],
    ["37 4 * * 1", 7 * day],
    // The longest of its gaps, for a schedule whose runs are not evenly spread.
    ["0 6,8 * * *", 22 * 3600],
    ["0 0 1 * *", 31 * day],
    // From the 31st of a month to the next month that has one.
    ["0 0 31 * *", 61 * day],
    // A year with a 29th of February in it.
    ["0 0 1 1 *", 366 * day],
    ["0 0 29 2 *", (4 * 365 + 1) * day],
  ])("of %s is %i seconds", (schedule, seconds) => {
    expect(everySecondsOf(schedule)).toBe(seconds);
  });

  it("is not made up for a schedule that cannot be read", () => {
    expect(() => everySecondsOf("every now and then")).toThrow();
  });
});

describe("what is kept of a failure", () => {
  it("is its kind, and for a provider its status and its host, never its text", () => {
    const answered = new UpstreamError({
      url: "https://user:secret@data.example.org:8443/buoys?key=secret&station=44025",
      status: 503,
      retryable: true,
    });
    expect(describeFailure(answered)).toEqual({
      kind: "provider",
      status: 503,
      host: "data.example.org:8443",
    });
    expect(describeFailure(new UpstreamError({ url: "not an address", retryable: false }))).toEqual(
      { kind: "provider" },
    );

    const told = new FormatError({ provider: "osm", message: "the server said: secret remark" });
    expect(describeFailure(told)).toEqual({ kind: "format" });
    const refused = new StoreError({
      provider: "ndbc",
      cause: new Error("insert into x params: a@b"),
    });
    expect(describeFailure(refused)).toEqual({ kind: "database" });
    for (const other of [new TypeError("secret"), "secret", null, undefined, { _tag: 3 }]) {
      expect(describeFailure(other)).toEqual({ kind: "other" });
    }

    const kept = JSON.stringify([answered, told, refused].map(describeFailure));
    for (const text of ["secret", "44025", "remark", "a@b", "user"])
      expect(kept).not.toContain(text);
  });
});

describe.skipIf(!TEST_DATABASE_URL)("what the worker says of itself", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;

  beforeAll(async () => {
    database = await createTestDatabase();
  });
  afterAll(() => database?.drop());
  beforeEach(async () => {
    await database.db.delete(job);
    await database.db.delete(workerProcess);
  });

  const theJob = async (name = "ingest-test") => {
    const [row] = await database.db.select().from(job).where(eq(job.name, name));
    return row!;
  };
  // An attempt that the scheduler started a number of seconds ago.
  const begun = (secondsAgo = 0) => ({
    job: { name: "ingest-test", schedule: "*/10 * * * *" },
    workerId: "worker-1",
    startedAt: new Date(Date.now() - secondsAgo * 1000),
  });
  const list = (schedule = "*/10 * * * *") =>
    listJobs(database.db, [{ name: "ingest-test", schedule }]);
  const quietly = () => vi.spyOn(console, "error").mockImplementation(() => {});
  // A database that refuses its first writes, or all of them.
  const refusing = (writes = Infinity) => {
    let left = writes;
    return new Proxy(database.db, {
      get(target, property) {
        if (property !== "insert" || left <= 0) return Reflect.get(target, property);
        return () => {
          left -= 1;
          throw new Error("This database takes no write");
        };
      },
    });
  };

  describe("a worker process", () => {
    const rowOf = async (id: string) =>
      (await database.db.select().from(workerProcess).where(eq(workerProcess.id, id)))[0];

    it("says when it started, when it was ready, and that it is still there", async () => {
      const worker = await announceWorker(database.db);

      const started = (await rowOf(worker.id))!;
      expect(started.readyAt).toBeNull();
      expect(started.startedAt.getTime()).toBeLessThanOrEqual(started.seenAt.getTime());

      await worker.ready();
      const ready = (await rowOf(worker.id))!;
      expect(ready.readyAt).toBeInstanceOf(Date);

      await worker.stop();
      const stopped = (await rowOf(worker.id))!;
      expect(stopped.seenAt.getTime()).toBeGreaterThanOrEqual(ready.seenAt.getTime());
      expect(stopped.startedAt).toEqual(started.startedAt);
      expect(stopped.readyAt).toEqual(ready.readyAt);
    });

    it("writes its row at the next saying when its start could not be written", async () => {
      const said = quietly();
      let isDown = true;
      const db = new Proxy(database.db, {
        get(target, property) {
          if (isDown && (property === "insert" || property === "delete")) {
            return () => {
              throw new Error("This database is down");
            };
          }
          return Reflect.get(target, property);
        },
      });

      const worker = await announceWorker(db);
      expect(await rowOf(worker.id)).toBeUndefined();

      isDown = false;
      await worker.ready();
      const row = (await rowOf(worker.id))!;
      expect(row.readyAt).toBeInstanceOf(Date);
      // It started before it was ready, and says so though it is written late.
      expect(row.startedAt.getTime()).toBeLessThanOrEqual(row.readyAt!.getTime());
      await worker.stop();
      said.mockRestore();
    });

    it("takes out the processes that were not seen for a week, and leaves the others", async () => {
      const ago = (days: number) => sql`now() - make_interval(days => ${days})`;
      await database.db.insert(workerProcess).values([
        { id: "gone", startedAt: ago(30), seenAt: ago(8) },
        { id: "recent", startedAt: ago(6), seenAt: ago(6) },
      ]);

      const worker = await announceWorker(database.db);
      await worker.stop();

      const ids = (await database.db.select().from(workerProcess)).map((row) => row.id).sort();
      expect(ids).toEqual(["recent", worker.id].sort());
    });
  });

  describe("the list of jobs", () => {
    it("gains a job with what its schedule asks, and keeps what the job did when it is listed again", async () => {
      await list();
      const first = await theJob();
      expect(first).toMatchObject({
        schedule: "*/10 * * * *",
        everySeconds: 600,
        expiresSeconds: RUN_SECONDS,
        attemptId: null,
        outcome: null,
        failuresInARow: 0,
      });

      // A worker that starts again, with another schedule for the job, which then runs.
      await list("12 * * * *");
      await recorded(
        database.db,
        { ...begun(), job: { name: "ingest-test", schedule: "12 * * * *" } },
        async () => ({ counts: { stations: 3 } }),
      );
      await list("12 * * * *");

      const again = await theJob();
      expect(again).toMatchObject({
        schedule: "12 * * * *",
        everySeconds: 3600,
        outcome: "succeeded",
        counts: { stations: 3 },
      });
      expect(again.firstSeenAt).toEqual(first.firstSeenAt);
      expect(again.lastSuccessAt).toBeInstanceOf(Date);
    });

    it("loses no job that a starting worker does not know, and the ones it retires by name", async () => {
      await listJobs(database.db, [
        { name: "ingest-test", schedule: "12 * * * *" },
        { name: "ingest-newer", schedule: "12 * * * *" },
        { name: "ingest-retired", schedule: "12 * * * *" },
      ]);

      // An older worker starts beside the newer one: it knows one job of the three.
      await list();
      await retireJobs(database.db, ["ingest-retired", "ingest-never-was"]);
      await retireJobs(database.db, []);

      const names = (await database.db.select().from(job)).map((row) => row.name).sort();
      expect(names).toEqual(["ingest-newer", "ingest-test"]);
    });

    it("gains the jobs that follow one whose schedule cannot be read", async () => {
      const said = quietly();
      await listJobs(database.db, [
        { name: "ingest-first", schedule: "12 * * * *" },
        { name: "ingest-wrong", schedule: "every now and then" },
        { name: "ingest-last", schedule: "12 * * * *" },
      ]);

      const names = (await database.db.select().from(job)).map((row) => row.name).sort();
      expect(names).toEqual(["ingest-first", "ingest-last"]);
      expect(said).toHaveBeenCalledWith(
        "state: could not note the job ingest-wrong",
        expect.any(Error),
      );
      said.mockRestore();
    });
  });

  describe("an attempt of a job", () => {
    beforeEach(() => list());

    it("is written when it starts, with its deadline, and before it ends", async () => {
      const running = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const attempt = begun(2);
      const run = recorded(database.db, attempt, async () => {
        running.resolve();
        await release.promise;
        return { counts: {} };
      });
      await running.promise;

      const during = await theJob();
      expect(during).toMatchObject({ workerId: "worker-1", finishedAt: null, outcome: null });
      expect(during.attemptId).toMatch(/^[0-9a-f-]{36}$/);
      // The scheduler's own start, and the deadline it keeps from it.
      expect(during.startedAt).toEqual(attempt.startedAt);
      expect(during.deadlineAt!.getTime() - during.startedAt!.getTime()).toBe(RUN_SECONDS * 1000);

      release.resolve();
      await run;
      expect((await theJob()).finishedAt).toBeInstanceOf(Date);
    });

    it("that works says so, with its counts, and gives them back", async () => {
      const done = await recorded(database.db, begun(), async () => ({
        counts: { stations: 12, newReadings: 40 },
      }));

      expect(done).toEqual({ counts: { stations: 12, newReadings: 40 } });
      expect(await theJob()).toMatchObject({
        outcome: "succeeded",
        counts: { stations: 12, newReadings: 40 },
        failure: null,
        failuresInARow: 0,
        lastFailureAt: null,
      });
    });

    it("that ran to its end with some of its work failed is degraded, and still a success", async () => {
      await recorded(database.db, begun(), async () => ({
        counts: { failedStations: 2 },
        degraded: true,
      }));

      const row = await theJob();
      expect(row).toMatchObject({ outcome: "degraded", failuresInARow: 0 });
      expect(row.lastSuccessAt).toBeInstanceOf(Date);
    });

    it("that fails says what kind of failure, throws it again, and counts the failures in a row", async () => {
      const failure = new UpstreamError({
        url: "https://data.example.org/buoys",
        status: 502,
        retryable: true,
      });
      const failing = () =>
        recorded(database.db, begun(), async () => {
          throw failure;
        });

      await recorded(database.db, begun(), async () => ({ counts: { stations: 9 } }));
      await expect(failing()).rejects.toBe(failure);
      await expect(failing()).rejects.toBe(failure);

      const kept = { kind: "provider", status: 502, host: "data.example.org" };
      const row = await theJob();
      expect(row).toMatchObject({
        outcome: "failed",
        // What the attempt before returned is not this one's.
        counts: null,
        failure: kept,
        lastFailure: kept,
        failuresInARow: 2,
      });
      expect(row.lastSuccessAt).toBeInstanceOf(Date);

      // It works again: the last failure is still told, and the count starts over.
      await recorded(database.db, begun(), async () => ({ counts: {} }));
      const mended = await theJob();
      expect(mended).toMatchObject({
        outcome: "succeeded",
        failure: null,
        lastFailure: kept,
        failuresInARow: 0,
      });
      expect(mended.lastFailureAt).toEqual(row.lastFailureAt);
    });

    it("that ends past its deadline is expired, whatever it returned, and no success", async () => {
      // Started five seconds ago, with one second to run: late by any clock.
      const late = () => ({ ...begun(5), expiresSeconds: 1 });

      await recorded(database.db, late(), async () => ({ counts: { stations: 1 } }));
      const first = await theJob();
      expect(first).toMatchObject({
        outcome: "expired",
        failure: { kind: "expired" },
        lastFailure: { kind: "expired" },
        lastSuccessAt: null,
        failuresInARow: 1,
      });
      expect(first.lastFailureAt).toBeInstanceOf(Date);

      await expect(
        recorded(database.db, late(), async () => {
          throw new Error("too late, and wrong");
        }),
      ).rejects.toThrow("too late");
      expect(await theJob()).toMatchObject({ outcome: "expired", failuresInARow: 2 });
    });

    it("that the scheduler stopped says why: it took too long, or the worker was stopping", async () => {
      const stopped = (why: "expired" | "stopped") =>
        recorded(database.db, { ...begun(), givenUp: () => why }, async () => {
          throw new Error("interrupted");
        });

      // The deadline has not passed by the database's clock: the scheduler is believed.
      await expect(stopped("expired")).rejects.toThrow("interrupted");
      expect(await theJob()).toMatchObject({
        outcome: "expired",
        failure: { kind: "expired" },
        lastFailure: { kind: "expired" },
      });

      await expect(stopped("stopped")).rejects.toThrow("interrupted");
      expect(await theJob()).toMatchObject({
        outcome: "failed",
        failure: { kind: "stopped" },
        failuresInARow: 2,
      });

      // A failure of the run's own, which the scheduler did not stop.
      await expect(
        recorded(database.db, { ...begun(), givenUp: () => null }, async () => {
          throw new FormatError({ provider: "test", message: "changed" });
        }),
      ).rejects.toBeInstanceOf(FormatError);
      expect(await theJob()).toMatchObject({ outcome: "failed", failure: { kind: "format" } });
    });

    it("that the scheduler gave up on changes nothing once another has started", async () => {
      const release = Promise.withResolvers<void>();
      const started = Promise.withResolvers<void>();
      // The first attempt goes on after the scheduler gave it up, and ends last.
      const first = recorded(database.db, begun(60), async () => {
        started.resolve();
        await release.promise;
        return { counts: { stations: 1 } };
      });
      await started.promise;
      await expect(
        recorded(database.db, { ...begun(), workerId: "worker-2" }, async () => {
          throw new FormatError({ provider: "test", message: "changed" });
        }),
      ).rejects.toBeInstanceOf(FormatError);
      const second = await theJob();

      release.resolve();
      await first;

      expect(await theJob()).toEqual(second);
      expect(second).toMatchObject({
        workerId: "worker-2",
        outcome: "failed",
        failure: { kind: "format" },
        // The first attempt had not ended when the second took the row: it counts as one
        // that stopped, and the second's own failure follows it.
        failuresInARow: 2,
      });
    });

    it("whose writes come in late, after a later attempt took the row, changes nothing", async () => {
      await recorded(database.db, { ...begun(), workerId: "worker-2" }, async () => ({
        counts: { stations: 7 },
      }));
      const later = await theJob();

      // An attempt the scheduler started a minute before, whose start and end were held up on
      // their way to the database.
      await recorded(database.db, begun(60), async () => ({ counts: { stations: 1 } }));
      await expect(
        recorded(database.db, begun(60), async () => {
          throw new Error("held up, and failed");
        }),
      ).rejects.toThrow("held up");

      expect(await theJob()).toEqual(later);
    });

    it("that never said how it ended is a failure, counted when the next one starts", async () => {
      // The worker died under this one.
      await database.db
        .update(job)
        .set({ attemptId: "lost", startedAt: sql`now() - interval '1 minute'` });

      await recorded(database.db, begun(), async () => ({ counts: {} }));

      const row = await theJob();
      expect(row).toMatchObject({
        outcome: "succeeded",
        failuresInARow: 0,
        lastFailure: { kind: "stopped" },
      });
      expect(row.lastFailureAt).toBeInstanceOf(Date);
      // One that ended is not counted again.
      await recorded(database.db, begun(), async () => ({ counts: {} }));
      expect((await theJob()).lastFailureAt).toEqual(row.lastFailureAt);
    });

    it("of a job that could not be listed gives the job its row", async () => {
      const unlisted = { ...begun(), job: { name: "unlisted", schedule: "12 * * * *" } };
      const done = await recorded(database.db, unlisted, async () => ({ counts: { done: 1 } }));

      expect(done.counts).toEqual({ done: 1 });
      expect(await theJob("unlisted")).toMatchObject({
        schedule: "12 * * * *",
        everySeconds: 3600,
        outcome: "succeeded",
        counts: { done: 1 },
      });
    });

    describe("whose start could not be written", () => {
      let said: ReturnType<typeof quietly>;
      beforeEach(() => {
        said = quietly();
      });
      afterEach(() => said.mockRestore());

      it("is written whole when it ends, for a job that has no row", async () => {
        const unlisted = { ...begun(3), job: { name: "unlisted", schedule: "12 * * * *" } };
        await recorded(refusing(1), unlisted, async () => ({ counts: { done: 1 } }));

        const row = await theJob("unlisted");
        expect(row).toMatchObject({
          schedule: "12 * * * *",
          everySeconds: 3600,
          expiresSeconds: RUN_SECONDS,
          workerId: "worker-1",
          outcome: "succeeded",
          counts: { done: 1 },
          failuresInARow: 0,
        });
        expect(row.startedAt).toEqual(unlisted.startedAt);
        expect(row.deadlineAt!.getTime() - row.startedAt!.getTime()).toBe(RUN_SECONDS * 1000);
        expect(row.lastSuccessAt).toBeInstanceOf(Date);
      });

      it("takes the row of the attempt before, with nothing of it left but its history", async () => {
        await recorded(database.db, begun(600), async () => ({ counts: { done: 9 } }));
        const failing = { ...begun(), job: { name: "ingest-test", schedule: "12 * * * *" } };

        await expect(
          recorded(refusing(1), failing, async () => {
            throw new FormatError({ provider: "test", message: "changed" });
          }),
        ).rejects.toBeInstanceOf(FormatError);

        const row = await theJob();
        expect(row).toMatchObject({
          // The schedule the job has now.
          schedule: "12 * * * *",
          everySeconds: 3600,
          outcome: "failed",
          counts: null,
          failure: { kind: "format" },
          failuresInARow: 1,
        });
        expect(row.startedAt).toEqual(failing.startedAt);
        expect(row.lastSuccessAt).toBeInstanceOf(Date);
      });

      it("counts the attempt before it that never ended, then its own failure", async () => {
        await database.db.update(job).set({
          attemptId: "lost",
          startedAt: sql`now() - interval '20 minutes'`,
          failuresInARow: 4,
        });

        await expect(
          recorded(refusing(1), begun(), async () => {
            throw new Error("its own");
          }),
        ).rejects.toThrow("its own");
        expect(await theJob()).toMatchObject({ failuresInARow: 6, failure: { kind: "other" } });

        // And when it works, the one that never ended is still its last failure.
        await database.db.update(job).set({
          attemptId: "lost",
          startedAt: sql`now() - interval '20 minutes'`,
          finishedAt: null,
          lastFailure: null,
          lastFailureAt: null,
        });
        await recorded(refusing(1), begun(), async () => ({ counts: {} }));
        const row = await theJob();
        expect(row).toMatchObject({
          outcome: "succeeded",
          failuresInARow: 0,
          lastFailure: { kind: "stopped" },
        });
        expect(row.lastFailureAt).toBeInstanceOf(Date);
      });

      it("leaves the row to an attempt that started after it", async () => {
        // The second attempt starts and ends while the first, which wrote no start, runs on.
        await recorded(refusing(1), begun(60), async () => {
          await expect(
            recorded(database.db, { ...begun(), workerId: "worker-2" }, async () => {
              throw new FormatError({ provider: "test", message: "changed" });
            }),
          ).rejects.toBeInstanceOf(FormatError);
          return { counts: { stations: 1 } };
        });

        expect(await theJob()).toMatchObject({
          workerId: "worker-2",
          outcome: "failed",
          counts: null,
        });
      });
    });

    it("runs and gives its result when its row cannot be written, and says so in the log", async () => {
      const said = quietly();
      const db = refusing();

      const done = await recorded(db, begun(), async () => ({ counts: { stations: 5 } }));
      await expect(
        recorded(db, begun(), async () => {
          throw new Error("the job's own failure");
        }),
      ).rejects.toThrow("the job's own failure");

      expect(done.counts).toEqual({ stations: 5 });
      expect(said).toHaveBeenCalledWith(
        "state: could not note the start of ingest-test",
        expect.any(Error),
      );
      said.mockRestore();
      expect(await theJob()).toMatchObject({ attemptId: null, outcome: null });
    });
  });

  describe("the limits the database keeps for the worker", () => {
    it("end a job's statement, and a job's transaction, that lasts too long", async () => {
      const said = quietly();
      const db = jobDatabase({ DATABASE_URL: database.url }, 1);
      try {
        await expect(db.execute(sql`select pg_sleep(3)`)).rejects.toThrow();

        // Each statement is short. The transaction they make is not.
        const long = db.transaction(async (tx) => {
          await tx.insert(workerProcess).values({
            id: "never-written",
            startedAt: sql`now()`,
            seenAt: sql`now()`,
          });
          await tx.execute(sql`select pg_sleep(0.7)`);
          await tx.execute(sql`select pg_sleep(0.7)`);
        });
        await expect(long).rejects.toThrow();

        // Nothing of it was written, and the next job finds a database that answers.
        expect((await db.select().from(workerProcess)).map((row) => row.id)).toEqual([]);
      } finally {
        await db.$client.end();
        said.mockRestore();
      }
    });

    it("hold whatever settings the database's address carries of its own", async () => {
      const address = new URL(database.url);
      // Settings of its own, limits lifted, and a backslash left at the end of its options.
      address.searchParams.set(
        "options",
        "-c transaction_timeout=0 -c statement_timeout=0 -c application_name=example\\",
      );
      address.searchParams.set("statement_timeout", "0");
      address.searchParams.set("lock_timeout", "0");
      address.searchParams.set("query_timeout", "600000");
      const settings = async (db: ReturnType<typeof jobDatabase>) => {
        const { rows } = await db.execute<Record<string, string>>(sql`
          select current_setting('statement_timeout') as statement,
            current_setting('transaction_timeout') as transaction,
            current_setting('lock_timeout') as lock,
            current_setting('application_name') as name
        `);
        return rows[0];
      };

      const jobs = jobDatabase({ DATABASE_URL: address.href }, 7);
      const state = stateDatabase({ DATABASE_URL: address.href }, 3000);
      try {
        expect(await settings(jobs)).toMatchObject({
          statement: "7s",
          transaction: "7s",
          name: "example",
        });
        expect(await settings(state)).toMatchObject({
          statement: "3s",
          lock: "3s",
          name: "example",
        });
        // A write that runs past the limit is ended, whatever the address says.
        await expect(state.execute(sql`select pg_sleep(4)`)).rejects.toThrow();
      } finally {
        await jobs.$client.end();
        await state.$client.end();
      }
    });

    it("give up a write of the worker's state that waits, so that it holds no job", async () => {
      const said = quietly();
      await list();
      const state = stateDatabase({ DATABASE_URL: database.url }, 300);
      const release = Promise.withResolvers<void>();
      const locked = Promise.withResolvers<void>();
      // Another program holds the job's row.
      const holding = database.db.transaction(async (tx) => {
        await tx.select().from(job).for("update");
        locked.resolve();
        await release.promise;
      });
      await locked.promise;

      try {
        const began = performance.now();
        const done = await recorded(state, begun(), async () => ({ counts: { stations: 2 } }));
        // The start waited, then the end: neither held the run for long, and it ran.
        expect(done.counts).toEqual({ stations: 2 });
        expect(performance.now() - began).toBeLessThan(3000);

        release.resolve();
        await holding;
        // The database ended both writes before the worker let go of them, so neither comes
        // in once the row is free.
        await new Promise((resolve) => setTimeout(resolve, 500));
        expect(await theJob()).toMatchObject({ attemptId: null, outcome: null, counts: null });
      } finally {
        release.resolve();
        await state.$client.end();
        said.mockRestore();
      }
    });
  });

  describe("the database of a run that the scheduler stopped", () => {
    it("takes nothing more, from a job that goes on all the same", async () => {
      const stop = new AbortController();
      const db = stoppable(database.db, stop.signal);
      const note = (id: string) =>
        db.insert(workerProcess).values({ id, startedAt: sql`now()`, seenAt: sql`now()` });

      // A job that saves its stations one by one, and goes on to the next when one fails.
      const saved: string[] = [];
      for (const id of ["one", "two", "three", "four"]) {
        if (id === "three") stop.abort();
        try {
          if (id === "two")
            await db.transaction((tx) =>
              tx.insert(workerProcess).values({ id, startedAt: sql`now()`, seenAt: sql`now()` }),
            );
          else await note(id);
          saved.push(id);
        } catch {
          // The next one.
        }
      }

      expect(saved).toEqual(["one", "two"]);
      expect(() => db.select()).toThrow();
      const ids = (await database.db.select().from(workerProcess)).map((row) => row.id).sort();
      expect(ids).toEqual(["one", "two"]);
    });

    it("undoes a transaction that was waiting for a connection when the run was stopped", async () => {
      // One connection, which another transaction holds.
      const single = createDb({ DATABASE_URL: database.url }, { max: 1 });
      const release = Promise.withResolvers<void>();
      const held = Promise.withResolvers<void>();
      const holding = single.transaction(async () => {
        held.resolve();
        await release.promise;
      });
      await held.promise;

      const stop = new AbortController();
      let wrote = false;
      const waiting = stoppable(single, stop.signal).transaction(async (tx) => {
        wrote = true;
        await tx.insert(workerProcess).values({
          id: "after-the-stop",
          startedAt: sql`now()`,
          seenAt: sql`now()`,
        });
      });
      stop.abort();
      release.resolve();

      try {
        await expect(waiting).rejects.toThrow();
        await holding;
        expect(wrote).toBe(false);
        expect(await single.select().from(workerProcess)).toEqual([]);
      } finally {
        await single.$client.end();
      }
    });
  });
});
