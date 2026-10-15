import { testForecasts } from "@repo/conditions/forecasts/testing";
import { surfBreak } from "@repo/db/schema/spots";
import { createTestDatabase, TEST_DATABASE_URL } from "@repo/db/testing";
import { Effect } from "effect";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { keepListedForecasts, pagesDone, SLICES_A_DAY, sliceAt } from "./pages";

// The forecasts of the listed breaks, kept by the worker in slices over the day: decision 057.

describe("the slice of a run", () => {
  it("is the part of the day the run falls in, and every run's when the day has one slice", () => {
    expect(sliceAt(new Date("2026-10-15T00:50:00Z"))).toBe(0);
    expect(sliceAt(new Date("2026-10-15T23:50:00Z"))).toBe(SLICES_A_DAY - 1);
  });
});

describe.skipIf(!TEST_DATABASE_URL)("the forecasts kept for the listed breaks", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;

  // Seven characteristics said: a break whose page stands on its own.
  const seven = {
    breakTypes: ["reef" as const],
    waveDirections: ["left" as const],
    bottomTypes: ["rock" as const],
    abilityLevels: ["advanced" as const],
    bestTides: ["mid" as const],
    bestSwellDirections: ["NW" as const],
    offshoreDirectionDegrees: 150,
  };
  const places = { countrySlug: "spain", regionSlug: "basque-country" };

  beforeAll(async () => {
    database = await createTestDatabase();
  });
  afterAll(() => database?.drop());
  beforeEach(async () => {
    await database.db.delete(surfBreak);
    await database.db.insert(surfBreak).values([
      // Two listed breaks in one cell, and a third in another.
      { id: "a", slug: "a", name: "A", latitude: 43.4, longitude: -2.7, ...places, ...seven },
      { id: "b", slug: "b", name: "B", latitude: 43.401, longitude: -2.701, ...places, ...seven },
      { id: "c", slug: "c", name: "C", latitude: 43.3, longitude: -2.0, ...places, ...seven },
      // A break with a place alone, and one with no places: no page is listed, nothing is kept.
      { id: "d", slug: "d", name: "D", latitude: 43.5, longitude: -3.0, ...places },
      { id: "e", slug: "e", name: "E", latitude: 10, longitude: 10, ...seven },
    ]);
  });

  // Every slice of a day, one after the other.
  // One cell at a time, so that the share is spent in a known order.
  const day = (forecasts: ReturnType<typeof testForecasts>["forecasts"]) =>
    Promise.all(
      Array.from({ length: SLICES_A_DAY }, (_, slice) =>
        Effect.runPromise(
          keepListedForecasts(
            database.db,
            forecasts,
            new Date(Date.UTC(2026, 9, 15, slice * (24 / SLICES_A_DAY), 50)),
            1,
          ),
        ),
      ),
    );

  it("asks once for each cell of the listed breaks over a day, and nothing for the others", async () => {
    const kept = testForecasts();
    const runs = await day(kept.forecasts);
    expect(runs.map((run) => run.cells)).toEqual(Array(SLICES_A_DAY).fill(2));
    expect(runs.map((run) => run.breaks)).toEqual(Array(SLICES_A_DAY).fill(3));
    // Two cells, each asked for once over the day's slices: a fresh one costs nothing again.
    expect(runs.reduce((sum, run) => sum + run.asked, 0)).toBe(2 * SLICES_A_DAY);
    expect(runs.reduce((sum, run) => sum + run.refreshed, 0)).toBe(2 * SLICES_A_DAY);
    expect(kept.provider.asked).toBe(2);
    expect(kept.seen.spent).toBe(4);
    expect([...kept.rows.keys()]).toHaveLength(2);
    expect(pagesDone(runs[0]!)).toMatchObject({ degraded: false });
  });

  it("stops asking once the share is spent, and says that the run is degraded", async () => {
    const kept = testForecasts();
    // One forecast's worth of requests: the second cell gets none.
    kept.limit(2);
    const runs = await day(kept.forecasts);
    const spent = runs.find((run) => run.budgetSpent);
    // The first cell was fetched, the second refused: the run stopped there.
    expect(spent).toMatchObject({ failed: 1, refreshed: 1 });
    expect(runs.reduce((sum, run) => sum + run.refreshed, 0)).toBe(1);
    expect(pagesDone(spent!)).toMatchObject({ degraded: true });
  });
});
