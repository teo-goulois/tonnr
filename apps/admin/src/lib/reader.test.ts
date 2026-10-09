import { InfiniteQueryObserver, QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { forgetCallsOfOthers, readBy, readByNoOne } from "./reader";

// The keys as the API's client writes them: the procedure's path, then what it was asked.
const WHO = [["v1", "account", "get"], { type: "query" }];
const MINE = [["v1", "console", "get"], { type: "query" }];
const callsOf = (developerId: string, procedure = "series") => [
  ["v1", "console", procedure],
  { type: "query", input: { developerId, step: "hour" } },
];
const who = { queryKey: [["v1", "account"]] };

const keysOf = (queryClient: QueryClient) =>
  queryClient
    .getQueryCache()
    .getAll()
    .map((query) => (query.queryKey[0] as string[]).join("."))
    .sort();

describe("what a page keeps of the account that loaded it", () => {
  it("stays while the same account is signed in", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(WHO, { id: "ana" });
    queryClient.setQueryData(MINE, { developers: ["screens"] });

    readBy(queryClient, "ana", who);
    readBy(queryClient, "ana", who);

    expect(queryClient.getQueryData(MINE)).toEqual({ developers: ["screens"] });
  });

  it("is dropped when another account is signed in, but who that is", () => {
    const queryClient = new QueryClient();
    readBy(queryClient, "ana", who);
    queryClient.setQueryData(MINE, { developers: ["screens"] });
    queryClient.setQueryData(callsOf("screens"), { points: [1] });
    // Another tab signed Ben in, and the API has just said so.
    queryClient.setQueryData(WHO, { id: "ben" });

    readBy(queryClient, "ben", who);

    expect(keysOf(queryClient)).toEqual(["v1.account.get"]);
    expect(queryClient.getQueryData(WHO)).toEqual({ id: "ben" });
  });

  it("is emptied under a screen that still draws the same thing, and asked again as the new reader", async () => {
    const queryClient = new QueryClient();
    readBy(queryClient, "ana", who);
    let reader = "ana";
    const observer = new QueryObserver(queryClient, {
      queryKey: MINE,
      queryFn: () => Promise.resolve({ developers: [`of ${reader}`] }),
      // What a screen keeps on show while it loads something else.
      placeholderData: (previous: unknown) => previous,
    });
    const drawn: unknown[] = [];
    const stop = observer.subscribe((result) => drawn.push(result.data));
    await queryClient.refetchQueries({ queryKey: MINE });
    expect(observer.getCurrentResult().data).toEqual({ developers: ["of ana"] });

    reader = "ben";
    drawn.length = 0;
    readBy(queryClient, "ben", who);

    // Nothing of Ana is drawn from then on, the time of the request included.
    expect(observer.getCurrentResult().data).toBeUndefined();
    await queryClient.refetchQueries({ queryKey: MINE });
    expect(observer.getCurrentResult().data).toEqual({ developers: ["of ben"] });
    expect(JSON.stringify(drawn)).not.toContain("of ana");
    stop();
  });

  // A screen that asked for something else since, and shows its last answer while it waits,
  // keeps that answer itself: the client's memory is not where it is. So a layout draws another
  // reader's screens anew, and this is what a new screen then finds.
  it("leaves a screen made for the new reader nothing of the one before, whatever the old screen showed", async () => {
    const queryClient = new QueryClient();
    readBy(queryClient, "ana", who);
    const never = () => new Promise<never>(() => {});
    const week = callsOf("screens", "series");
    const month = [
      ["v1", "console", "series"],
      { type: "query", input: { developerId: "screens", step: "day" } },
    ];
    queryClient.setQueryData(week, { points: ["of ana"] });
    // Ana's screen went from the week to the month, which has not come yet.
    const before = new QueryObserver(queryClient, {
      queryKey: week,
      queryFn: never,
      staleTime: Infinity,
      placeholderData: (previous: unknown) => previous,
    });
    const stop = before.subscribe(() => {});
    before.setOptions({
      queryKey: month,
      queryFn: never,
      placeholderData: (previous: unknown) => previous,
    });
    expect(before.getCurrentResult().data).toEqual({ points: ["of ana"] });

    readBy(queryClient, "ben", who);
    stop();

    // Ben's screen, on the same span of time.
    for (const queryKey of [week, month]) {
      const after = new QueryObserver(queryClient, {
        queryKey,
        queryFn: never,
        placeholderData: (previous: unknown) => previous,
      });
      const stopAfter = after.subscribe(() => {});
      expect(after.getCurrentResult().data, JSON.stringify(queryKey)).toBeUndefined();
      stopAfter();
    }
    expect(queryClient.getQueryData(week)).toBeUndefined();
  });

  it("leaves a new screen none of the pages a list had, the one being searched too", async () => {
    const queryClient = new QueryClient();
    readBy(queryClient, "ana", who);
    const never = () => new Promise<never>(() => {});
    const list = (q: string) => [["v1", "accounts", "list"], { type: "infinite", input: { q } }];
    const pages = { initialPageParam: undefined, getNextPageParam: () => undefined };
    queryClient.setQueryData(list("a"), {
      pages: [{ accounts: ["of ana"] }],
      pageParams: [undefined],
    });
    const before = new InfiniteQueryObserver(queryClient, {
      ...pages,
      queryKey: list("a"),
      queryFn: never,
      staleTime: Infinity,
      placeholderData: (previous: unknown) => previous as never,
    });
    const stop = before.subscribe(() => {});
    // A search under way, drawn over the list before it.
    before.setOptions({
      ...pages,
      queryKey: list("an"),
      queryFn: never,
      placeholderData: (previous: unknown) => previous as never,
    });
    expect(JSON.stringify(before.getCurrentResult().data)).toContain("of ana");

    readBy(queryClient, "ben", who);
    stop();

    for (const q of ["a", "an"]) {
      const after = new InfiniteQueryObserver(queryClient, {
        ...pages,
        queryKey: list(q),
        queryFn: never,
        placeholderData: (previous: unknown) => previous as never,
      });
      const stopAfter = after.subscribe(() => {});
      expect(after.getCurrentResult().data, q).toBeUndefined();
      stopAfter();
    }
  });

  it("gives up a request that left for the reader before", async () => {
    const queryClient = new QueryClient();
    readBy(queryClient, "ana", who);
    let answer: (value: unknown) => void = () => {};
    const asked = queryClient
      .fetchQuery({
        queryKey: callsOf("screens"),
        queryFn: () => new Promise((resolve) => (answer = resolve)),
      })
      .catch((error: unknown) => error);

    readBy(queryClient, "ben", who);
    answer({ points: ["of ana"] });
    await asked;

    expect(queryClient.getQueryData(callsOf("screens"))).toBeUndefined();
  });

  it("is all dropped when no one is signed in, and the next account starts from nothing", () => {
    const queryClient = new QueryClient();
    readBy(queryClient, "ana", who);
    queryClient.setQueryData(WHO, { id: "ana" });
    queryClient.setQueryData(MINE, { developers: ["screens"] });

    readByNoOne(queryClient);

    expect(keysOf(queryClient)).toEqual([]);
    // Ana again, or anyone: there is nothing to drop, and nothing is.
    queryClient.setQueryData(WHO, { id: "ben" });
    queryClient.setQueryData(MINE, { developers: ["clock"] });
    readBy(queryClient, "ben", who);
    expect(queryClient.getQueryData(MINE)).toEqual({ developers: ["clock"] });
  });

  it("is kept apart for each client", () => {
    const first = new QueryClient();
    const second = new QueryClient();
    readBy(first, "ana", who);
    readBy(second, "ben", who);
    first.setQueryData(MINE, { developers: ["screens"] });

    readBy(first, "ana", who);

    expect(first.getQueryData(MINE)).toEqual({ developers: ["screens"] });
  });
});

describe("what the console keeps of a developer account", () => {
  const calls = [
    { queryKey: [["v1", "console", "series"]] },
    { queryKey: [["v1", "console", "breakdown"]] },
  ];

  it("is dropped once the reader is no longer one of its members, and the rest stays", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(MINE, { developers: ["clock"] });
    queryClient.setQueryData(callsOf("screens"), { points: [1] });
    queryClient.setQueryData(callsOf("screens", "breakdown"), { rows: [1] });
    queryClient.setQueryData(callsOf("clock"), { points: [2] });

    forgetCallsOfOthers(queryClient, calls, new Set(["clock"]));

    expect(queryClient.getQueryData(callsOf("screens"))).toBeUndefined();
    expect(queryClient.getQueryData(callsOf("screens", "breakdown"))).toBeUndefined();
    expect(queryClient.getQueryData(callsOf("clock"))).toEqual({ points: [2] });
    expect(queryClient.getQueryData(MINE)).toEqual({ developers: ["clock"] });
  });

  it("is all dropped when the reader is a member of none", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(callsOf("screens"), { points: [1] });
    queryClient.setQueryData(callsOf("clock", "breakdown"), { rows: [2] });

    forgetCallsOfOthers(queryClient, calls, new Set());

    expect(keysOf(queryClient)).toEqual([]);
  });

  it("gives up the request under way for it", async () => {
    const queryClient = new QueryClient();
    let answer: (value: unknown) => void = () => {};
    const asked = queryClient
      .fetchQuery({
        queryKey: callsOf("screens"),
        queryFn: () => new Promise((resolve) => (answer = resolve)),
      })
      .catch((error: unknown) => error);

    forgetCallsOfOthers(queryClient, calls, new Set());
    answer({ points: ["late"] });
    await asked;

    expect(queryClient.getQueryData(callsOf("screens"))).toBeUndefined();
  });
});
