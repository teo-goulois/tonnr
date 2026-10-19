import { call, ORPCError } from "@orpc/server";
import type { Session } from "@repo/auth";
import { BLOCKS_MOST, blockedBy } from "@repo/db/blocks";
import { pairOf } from "@repo/db/friends";
import { user } from "@repo/db/schema/auth";
import {
  accountBlock,
  accountLink,
  breakContribution,
  friendship,
} from "@repo/db/schema/community";
import { providerCalls } from "@repo/db/schema/forecasts";
import { stationList, stationListBreak, stationListShare } from "@repo/db/schema/lists";
import { reportNotice, reportNoticeReport, surfReport } from "@repo/db/schema/reports";
import { surfBreak } from "@repo/db/schema/spots";
import { createTestDatabase, TEST_DATABASE_URL } from "@repo/db/testing";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Context } from "./context";
import { v1Router } from "./routers/index";
import { testForecasts, testPlaces, testVerification } from "./testing";
import { createUsage, type Usage } from "./usage";

// An account that blocks another, and what it no longer reads of it: decision 071.
describe.skipIf(!TEST_DATABASE_URL)("blocking an account", () => {
  const WEB = "https://app.example.org";
  const ADMIN = "https://admin.example.org";
  const REEF = "0b6f7a52-4d1c-4f0e-9a3e-1c2d3e4f5a71";
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let usage: Usage;
  const { forecasts } = testForecasts();

  beforeAll(async () => {
    database = await createTestDatabase();
    usage = createUsage(database.db, { every: null });
  });
  afterAll(() => database?.drop());
  beforeEach(async () => {
    const { db } = database;
    await db.delete(breakContribution);
    await db.delete(user);
    await db.delete(surfBreak);
    await db.delete(providerCalls);
    await db.insert(user).values(
      ["ana", "ben", "cy"].map((id) => ({
        id,
        name: id,
        username: id,
        email: `${id}@example.org`,
        emailVerified: true,
      })),
    );
    await db
      .insert(surfBreak)
      .values({ id: REEF, slug: "reef", name: "The reef", latitude: 48, longitude: -4.5 });
  });

  const by = (id: string | null) => {
    const context: Context = {
      db: database.db,
      session: id
        ? ({
            user: { id, name: id, email: `${id}@example.org`, emailVerified: true },
            session: {
              id: `s-${id}`,
              userId: id,
              token: `t-${id}`,
              expiresAt: new Date("2030-01-01"),
            },
          } as Session)
        : null,
      authorization: null,
      site: WEB,
      adminSites: [ADMIN],
      usage,
      forecasts,
      places: testPlaces().places,
      verification: testVerification(database.db, { on: false }).verification,
      reply: {},
      server: { startedAt: new Date(), webOrigin: WEB },
    };
    return { context };
  };
  const refused = async (attempt: Promise<unknown>) => {
    try {
      await attempt;
      return { code: "answered", data: undefined as unknown };
    } catch (error) {
      if (!(error instanceof ORPCError)) throw error;
      return { code: error.code as string, data: error.data as unknown };
    }
  };
  const block = (blocker: string, username: string) =>
    call(v1Router.blocks.add, { username }, by(blocker));

  it("is made by the username the account reads, listed with it, and lifted by its own id", async () => {
    const made = await block("ana", "@Ben");
    expect(made).toEqual({ id: expect.any(String), username: "ben", since: expect.any(Date) });
    // A block names nothing of the account but the name it was blocked under.
    expect(made.id).not.toBe("ben");
    // Blocking again changes nothing.
    expect(await block("ana", "ben")).toEqual(made);

    // It outlives a change of username, and does not follow it: the blocker is not told who the
    // account became.
    await database.db.update(user).set({ username: "ben_k" }).where(eq(user.id, "ben"));
    expect(await call(v1Router.blocks.list, undefined, by("ana"))).toEqual({
      blocks: [{ id: made.id, username: "ben", since: made.since }],
    });
    expect((await blockedBy(database.db, "ana")).has("ben")).toBe(true);
    // It is the blocker's alone to read, and to lift.
    expect(await call(v1Router.blocks.list, undefined, by("ben"))).toEqual({ blocks: [] });
    expect(await refused(call(v1Router.blocks.remove, { id: made.id }, by("cy")))).toMatchObject({
      code: "NOT_FOUND",
    });

    expect(await refused(block("ana", "nobody_here"))).toMatchObject({ code: "NOT_FOUND" });
    expect(await refused(block("ana", "ana"))).toMatchObject({ code: "CONFLICT" });

    expect(await call(v1Router.blocks.remove, { id: made.id }, by("ana"))).toEqual({
      lifted: true,
    });
    expect(await refused(call(v1Router.blocks.remove, { id: made.id }, by("ana")))).toMatchObject({
      code: "NOT_FOUND",
    });
    expect(await call(v1Router.blocks.list, undefined, by("ana"))).toEqual({ blocks: [] });
  });

  it("answers 404 for an account deleted while it was being blocked", async () => {
    // Ben's deletion holds his row: the block finds him, then waits for the row, which goes.
    let release = () => {};
    const released = new Promise<void>((resolve) => (release = resolve));
    let holding = () => {};
    const isHolding = new Promise<void>((resolve) => (holding = resolve));
    const deleting = database.db.transaction(async (tx) => {
      await tx.select({ id: user.id }).from(user).where(eq(user.id, "ben")).for("update");
      holding();
      await released;
      await tx.delete(user).where(eq(user.id, "ben"));
    });
    await isHolding;
    const attempt = refused(block("ana", "ben"));
    await new Promise((resolve) => setTimeout(resolve, 200));
    release();
    await deleting;
    expect(await attempt).toMatchObject({ code: "NOT_FOUND" });
    expect(await database.db.select().from(accountBlock)).toEqual([]);
  });

  it(`blocks ${BLOCKS_MOST} accounts at most`, async () => {
    const many = Array.from({ length: BLOCKS_MOST }, (_, index) => `many-${index}`);
    await database.db
      .insert(user)
      .values(many.map((id) => ({ id, name: id, email: `${id}@example.org` })));
    await database.db
      .insert(accountBlock)
      .values(many.map((blockedId) => ({ blockerId: "ana", blockedId, username: blockedId })));

    expect(await refused(block("ana", "ben"))).toMatchObject({ code: "FORBIDDEN" });
    expect((await blockedBy(database.db, "ana")).has("ben")).toBe(false);
  });

  it("ends a friendship, and no link makes another while it stands, either way", async () => {
    const { db } = database;
    await db.insert(friendship).values({ ...pairOf("ana", "ben") });
    await db.insert(accountLink).values([
      { userId: "ana", token: "ana-link" },
      { userId: "ben", token: "ben-link" },
    ]);

    const made = await block("ana", "ben");
    const [ended] = await db.select().from(friendship);
    expect(ended).toMatchObject({ endedBy: "ana", endedAt: expect.any(Date) });
    expect((await call(v1Router.friends.list, undefined, by("ana"))).friends).toEqual([]);
    expect((await call(v1Router.friends.list, undefined, by("ben"))).friends).toEqual([]);

    // The blocked account is not told: it reads the friendship as one that was ended.
    const asked = await refused(call(v1Router.friends.accept, { token: "ana-link" }, by("ben")));
    expect(asked).toMatchObject({ code: "FORBIDDEN" });
    expect(asked.data).toBeUndefined();
    // It still reads whose link it is, as anyone does.
    expect(await call(v1Router.friends.open, { token: "ana-link" }, by("ben"))).toMatchObject({
      username: "ana",
    });
    // The blocker reads no name of the account it blocked, and is told why the link makes nothing.
    expect(
      await refused(call(v1Router.friends.open, { token: "ben-link" }, by("ana"))),
    ).toMatchObject({ code: "NOT_FOUND", data: { blocked: true } });
    // Anyone else, and a visitor, reads it as before.
    expect(await call(v1Router.friends.open, { token: "ben-link" }, by("cy"))).toMatchObject({
      username: "ben",
    });
    expect(await call(v1Router.friends.open, { token: "ben-link" }, by(null))).toMatchObject({
      username: "ben",
    });
    expect(
      await refused(call(v1Router.friends.accept, { token: "ben-link" }, by("ana"))),
    ).toMatchObject({ code: "FORBIDDEN", data: { blocked: true } });

    // Once the block is lifted, the blocker makes the friendship again by the other's link.
    await call(v1Router.blocks.remove, { id: made.id }, by("ana"));
    expect(await call(v1Router.friends.accept, { token: "ben-link" }, by("ana"))).toMatchObject({
      id: "ben",
      username: "ben",
    });
  });

  it("hides the blocked account's reports from the blocker, and from nobody else", async () => {
    const { db } = database;
    const now = new Date();
    await db.insert(surfReport).values(
      ["ben", "cy"].map((userId) => ({
        id: `${userId}-report`,
        userId,
        breakId: REEF,
        state: "published" as const,
        terms: "2026-10-19",
        createdAt: now,
        publishedAt: now,
      })),
    );
    await block("ana", "ben");
    const authors = async (id: string | null) =>
      (await call(v1Router.reports.list, { breakId: REEF }, by(id))).reports.map(
        (one) => one.author,
      );

    expect(await authors("ana")).toEqual(["cy"]);
    // The block goes one way: the blocked account, and everyone else, read as before.
    expect((await authors("ben")).toSorted()).toEqual(["ben", "cy"]);
    expect((await authors("cy")).toSorted()).toEqual(["ben", "cy"]);
    expect((await authors(null)).toSorted()).toEqual(["ben", "cy"]);
  });

  it("leaves the blocked account's reports out of the blocker's notices, and a notice of only those", async () => {
    const { db } = database;
    const now = Date.now();
    const report = (id: string, userId: string, ago: number) => ({
      id,
      userId,
      breakId: REEF,
      state: "published" as const,
      waveSize: "chest" as const,
      note: `By ${userId}.`,
      terms: "2026-10-19",
      createdAt: new Date(now - ago),
      publishedAt: new Date(now - ago),
    });
    await db
      .insert(surfReport)
      .values([
        report("ben-1", "ben", 10_000),
        report("cy-1", "cy", 20_000),
        report("ben-2", "ben", 30_000),
      ]);
    await db.insert(reportNotice).values([
      {
        id: "mixed",
        userId: "ana",
        breakId: REEF,
        told: 2,
        createdAt: new Date(now - 5_000),
        updatedAt: new Date(now - 5_000),
      },
      {
        id: "only-ben",
        userId: "ana",
        breakId: REEF,
        told: 1,
        createdAt: new Date(now - 4_000),
        updatedAt: new Date(now - 4_000),
      },
    ]);
    await db.insert(reportNoticeReport).values([
      { noticeId: "mixed", reportId: "ben-1" },
      { noticeId: "mixed", reportId: "cy-1" },
      { noticeId: "only-ben", reportId: "ben-2" },
    ]);
    const list = () => call(v1Router.reportNotices.list, {}, by("ana"));

    expect((await list()).notices.map((one) => one.id)).toEqual(["only-ben", "mixed"]);
    await block("ana", "ben");
    const after = await list();
    expect(after.unread).toBe(1);
    expect(after.notices).toEqual([
      expect.objectContaining({
        id: "mixed",
        told: 1,
        shown: 1,
        latest: expect.objectContaining({ reportId: "cy-1", author: "cy" }),
      }),
    ]);
  });

  it("keeps the blocker's notices whose reports were taken down, as anyone's", async () => {
    const { db } = database;
    const now = Date.now();
    const report = (id: string, userId: string, ago: number) => ({
      id,
      userId,
      breakId: REEF,
      state: "published" as const,
      terms: "2026-10-19",
      createdAt: new Date(now - ago),
      publishedAt: new Date(now - ago),
    });
    await db
      .insert(surfReport)
      .values([
        report("cy-gone", "cy", 10_000),
        report("ben-1", "ben", 20_000),
        report("cy-half", "cy", 30_000),
      ]);
    const notice = (id: string, told: number, ago: number) => ({
      id,
      userId: "ana",
      breakId: REEF,
      told,
      createdAt: new Date(now - ago),
      updatedAt: new Date(now - ago),
    });
    // One that told a report of Cy's alone, and one that told one of Ben's and one of Cy's.
    await db.insert(reportNotice).values([notice("gone", 1, 4_000), notice("half", 2, 5_000)]);
    await db.insert(reportNoticeReport).values([
      { noticeId: "gone", reportId: "cy-gone" },
      { noticeId: "half", reportId: "ben-1" },
      { noticeId: "half", reportId: "cy-half" },
    ]);
    await block("ana", "ben");
    // Cy deletes both: their rows go with them, and the notices still say they told them.
    await db.delete(surfReport).where(eq(surfReport.userId, "cy"));

    const listed = await call(v1Router.reportNotices.list, {}, by("ana"));
    expect(listed.unread).toBe(2);
    expect(listed.notices).toEqual([
      expect.objectContaining({ id: "gone", told: 1, shown: 0, state: "removed", latest: null }),
      expect.objectContaining({ id: "half", told: 1, shown: 0, state: "removed", latest: null }),
    ]);
  });

  it("hides what the blocked account has waiting in a guide, and its name on what was confirmed", async () => {
    const { db } = database;
    const now = new Date();
    await db.insert(breakContribution).values([
      {
        id: "ben-confirmed",
        breakId: REEF,
        breakRef: REEF,
        userId: "ben",
        line: "breakTypes",
        value: ["reef"],
        license: "ODbL-1.0",
        status: "confirmed",
        confirmedAt: now,
      },
      {
        id: "ben-shown",
        breakId: REEF,
        breakRef: REEF,
        userId: "ben",
        line: "bottomTypes",
        value: ["rock"],
        license: "ODbL-1.0",
        status: "shown",
        shownAt: now,
      },
      {
        id: "cy-shown",
        breakId: REEF,
        breakRef: REEF,
        userId: "cy",
        line: "bottomTypes",
        value: ["sand"],
        license: "ODbL-1.0",
        status: "shown",
        shownAt: new Date(now.getTime() - 1000),
      },
    ]);
    // Ana keeps the reef, and had a contribution of her own confirmed: she may confirm and
    // contest what others wrote there.
    await db.insert(stationList).values({ id: "ana-list", userId: "ana", name: "Mine" });
    await db.insert(stationListBreak).values({ listId: "ana-list", breakId: REEF });
    await db.insert(breakContribution).values({
      id: "ana-confirmed",
      breakId: REEF,
      breakRef: REEF,
      userId: "ana",
      line: "bestTides",
      value: ["low"],
      license: "ODbL-1.0",
      status: "confirmed",
      confirmedAt: now,
    });
    await block("ana", "ben");

    const guideOf = async (id: string | null) =>
      call(v1Router.guides.get, { breakId: REEF, language: "en" }, by(id));
    const line = (guide: Awaited<ReturnType<typeof guideOf>>, name: string) =>
      guide.lines.find((one) => one.line === name);

    const read = await guideOf("ana");
    // A confirmed line stays what the guide says, under no name.
    expect(line(read, "breakTypes")).toMatchObject({
      value: ["reef"],
      origin: "contribution",
      by: null,
    });
    expect(line(read, "bottomTypes")?.proposed.map((one) => one.id)).toEqual(["cy-shown"]);
    // Everyone else reads both, with their names.
    const theirs = await guideOf("cy");
    expect(line(theirs, "breakTypes")?.by).toMatchObject({ username: "ben" });
    expect(line(theirs, "bottomTypes")?.proposed.map((one) => one.id)).toEqual([
      "ben-shown",
      "cy-shown",
    ]);
    expect(line(await guideOf(null), "bottomTypes")?.proposed).toHaveLength(2);

    // What the blocker cannot see, it says nothing of; what the guide says, it may still contest.
    expect(
      await refused(call(v1Router.contributions.confirm, { id: "ben-shown" }, by("ana"))),
    ).toMatchObject({ code: "NOT_FOUND" });
    expect(
      await refused(
        call(v1Router.contributions.contest, { id: "ben-shown", reason: "Not rock." }, by("ana")),
      ),
    ).toMatchObject({ code: "NOT_FOUND" });
    expect(
      await call(
        v1Router.contributions.contest,
        { id: "ben-confirmed", reason: "It is a point." },
        by("ana"),
      ),
    ).toEqual({ contested: true });
    expect(await call(v1Router.contributions.confirm, { id: "cy-shown" }, by("ana"))).toMatchObject(
      {
        confirmations: 1,
      },
    );
  });

  it("answers no name for the owner of a shared list the reader blocked", async () => {
    const { db } = database;
    await db.insert(stationList).values({ id: "ben-list", userId: "ben", name: "Ben's" });
    await db
      .insert(stationListShare)
      .values({ listId: "ben-list", token: "bens_share_link_000000" });
    await block("ana", "ben");

    expect(
      await call(v1Router.shared.open, { token: "bens_share_link_000000" }, by("ana")),
    ).toMatchObject({
      locked: false,
      owner: null,
    });
    expect(
      await call(v1Router.shared.open, { token: "bens_share_link_000000" }, by("cy")),
    ).toMatchObject({
      owner: "ben",
    });
  });

  it("goes with either account", async () => {
    await block("ana", "ben");
    await database.db.delete(user).where(eq(user.id, "ben"));
    expect(
      await database.db
        .select()
        .from(accountBlock)
        .where(and(eq(accountBlock.blockerId, "ana"))),
    ).toEqual([]);
  });
});
