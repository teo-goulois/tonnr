import { ORPCError } from "@orpc/client";
import { hashKey } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import {
  KEPT_PREFIX,
  KEPT_VERSION,
  deserializeAnswer,
  isGone,
  isKept,
  queryHashOf,
  serializeAnswer,
  storedAs,
  tideWithin,
  whyNotRefreshed,
} from "./kept-answers";

// A query's key as oRPC writes it: the procedure's path, then what it asks.
const keyOf = (path: string, input?: object) =>
  [path.split("."), { ...(input && { input }), type: "query" }] as const;
const storageKeyOf = (key: readonly unknown[]) => `${KEPT_PREFIX}-${hashKey(key)}`;

const HOUR = 60 * 60 * 1000;
const at = (hours: number) => new Date(Date.UTC(2026, 10, 2) + hours * HOUR);

describe("what the phone keeps of the API's answers", () => {
  it("keeps the sea at a place, the places and the account's spots and lists", () => {
    for (const path of [
      "v1.forecasts.get",
      "v1.tides.timeline",
      "v1.stations.readings",
      "v1.stations.list",
      "v1.breaks.get",
      "v1.spots.get",
      "v1.lists.list",
    ]) {
      expect(isKept(keyOf(path, { id: "x" })), path).toBe(true);
    }
  });

  it("keeps nothing else of the account, and nothing that changes with what is typed", () => {
    for (const path of [
      "v1.alerts.list",
      "v1.sessions.list",
      "v1.media.sessions",
      "v1.breaks.search",
      "v1.places.search",
      "v1.profile.get",
    ]) {
      expect(isKept(keyOf(path, { id: "x" })), path).toBe(false);
    }
    expect(isKept(["a key", "of its own"])).toBe(false);
  });

  it("reads in an answer's name its procedure and the point it was asked at", () => {
    const key = keyOf("v1.tides.timeline", {
      latitude: 43.48,
      longitude: -1.56,
      start: at(-24),
      end: at(24 * 7),
      stepMinutes: 10,
    });
    expect(storedAs(storageKeyOf(key))).toEqual({
      procedure: "v1.tides.timeline",
      point: "43.48,-1.56",
    });
    expect(storedAs(storageKeyOf(keyOf("v1.breaks.get", { id: "b" })))).toEqual({
      procedure: "v1.breaks.get",
      point: undefined,
    });
    expect(queryHashOf(storageKeyOf(key))).toBe(hashKey(key));
    expect(storedAs("another-name")).toBeUndefined();
    expect(storedAs(`${KEPT_PREFIX}-not json`)).toBeUndefined();
  });

  it("gives an answer back with its dates", () => {
    const answer = {
      buster: KEPT_VERSION,
      queryHash: "hash",
      queryKey: ["v1", { input: { start: at(0) } }],
      state: {
        data: { station: { id: "s" }, readings: [{ observedAt: at(-1), waveHeight: 1.2 }] },
        dataUpdateCount: 1,
        dataUpdatedAt: 1000,
        error: null,
        errorUpdateCount: 0,
        errorUpdatedAt: 0,
        fetchFailureCount: 0,
        fetchFailureReason: null,
        fetchMeta: null,
        isInvalidated: false,
        status: "success" as const,
        fetchStatus: "idle" as const,
      },
    };
    const back = deserializeAnswer(serializeAnswer(answer));
    expect(back).toEqual(answer);
    const readings = (back.state.data as typeof answer.state.data).readings;
    expect(readings[0]?.observedAt).toBeInstanceOf(Date);
  });
});

describe("a tide kept for another span", () => {
  const timeline = {
    datum: "LAT",
    timeline: [-30, -6, 0, 6, 30].map((hours) => ({ time: at(hours), heightMeters: 2 })),
  };

  it("is cut to the span asked", () => {
    expect(tideWithin(timeline, at(-6), at(6))?.timeline.map((step) => step.time)).toEqual([
      at(-6),
      at(0),
      at(6),
    ]);
    const extremes = {
      datum: "LAT",
      extremes: [{ time: at(-30) }, { time: at(3) }],
    };
    expect(tideWithin(extremes, at(0), at(24))?.extremes).toEqual([{ time: at(3) }]);
  });

  it("stands for nothing when none of it falls in the span", () => {
    expect(tideWithin(timeline, at(40), at(48))).toBeUndefined();
  });
});

describe("an answer that could not be read again", () => {
  const offline = new TypeError("Network request failed");
  const notFound = new ORPCError("NOT_FOUND");

  it("stands while the API has not said that what it asked is gone", () => {
    expect(isGone({ isError: true, data: { id: "b" }, error: offline })).toBe(false);
    expect(isGone({ isError: false, data: undefined, error: null })).toBe(false);
  });

  it("is gone with nothing in hand, or once the API says so", () => {
    expect(isGone({ isError: true, data: undefined, error: offline })).toBe(true);
    expect(isGone({ isError: true, data: { id: "b" }, error: notFound })).toBe(true);
  });

  it("says whether the network or the API kept it from being read again", () => {
    expect(whyNotRefreshed({ isRefetchError: true, error: offline })).toBe("offline");
    expect(
      whyNotRefreshed({ isRefetchError: true, error: new ORPCError("TOO_MANY_REQUESTS") }),
    ).toBe("refused");
    expect(whyNotRefreshed({ isRefetchError: false, error: null })).toBeUndefined();
  });
});
