import { call, ORPCError } from "@orpc/server";
import type { Session } from "@repo/auth";
import { operator } from "@repo/db/schema/access";
import { alertSettings } from "@repo/db/schema/alerts";
import { user } from "@repo/db/schema/auth";
import { providerCalls } from "@repo/db/schema/forecasts";
import { stationList, stationListBreak, stationListMember } from "@repo/db/schema/lists";
import { media } from "@repo/db/schema/media";
import { reportNotice, reportNoticeReport, surfReport } from "@repo/db/schema/reports";
import { surfBreak } from "@repo/db/schema/spots";
import { createTestDatabase, TEST_DATABASE_URL } from "@repo/db/testing";
import { testStorage } from "@repo/media/testing";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Context } from "./context";
import { REPORT_COUNTS_AN_HOUR } from "./reports";
import { v1Router } from "./routers/index";
import { testForecasts, testPlaces, testVerification } from "./testing";
import { createUsage, type Usage } from "./usage";

const HOUR = 60 * 60 * 1000;

// What an account is told of the reports at the breaks it keeps, and what a report's author
// reads of it: decision 068.
describe.skipIf(!TEST_DATABASE_URL)("the notices of reports and their counts", () => {
  const WEB = "https://app.example.org";
  const ADMIN = "https://admin.example.org";
  const AT = new Date("2026-10-18T10:00:00Z");
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let usage: Usage;
  let storage: ReturnType<typeof testStorage>;

  beforeAll(async () => {
    database = await createTestDatabase();
    usage = createUsage(database.db, { every: null });
  });
  afterAll(() => database?.drop());
  afterEach(() => {
    vi.useRealTimers();
  });
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date", "performance"] });
    vi.setSystemTime(AT);
    storage = testStorage();
    const { db } = database;
    await db.delete(user);
    await db.delete(surfBreak);
    await db.delete(providerCalls);
    await db.insert(user).values(
      ["ana", "ben", "cy", "op"].map((id) => ({
        id,
        name: id,
        email: `${id}@example.org`,
        username: id,
      })),
    );
    await db.insert(operator).values({ userId: "op" });
    await db.insert(surfBreak).values([
      { id: "point", slug: "point", name: "The point", latitude: 43.48, longitude: -1.56 },
      { id: "reef", slug: "reef", name: "The reef", latitude: 43.5, longitude: -1.6 },
    ]);
  });

  const by = (id: string | null, site = WEB, address = "203.0.113.7") => {
    const context: Context = {
      db: database.db,
      session: id
        ? ({
            user: { id, name: id, email: `${id}@example.org`, emailVerified: false },
            session: {
              id: `s-${id}`,
              userId: id,
              token: `t-${id}`,
              expiresAt: new Date("2030-01-01"),
            },
          } as Session)
        : null,
      authorization: null,
      site,
      adminSites: [ADMIN],
      address,
      usage,
      forecasts: testForecasts().forecasts,
      places: testPlaces().places,
      verification: testVerification(database.db, { on: false }).verification,
      reply: {},
      server: { startedAt: new Date("2026-10-18T08:00:00Z"), webOrigin: WEB },
      storage,
    };
    return { context };
  };
  const refusal = (code: string) =>
    expect.objectContaining({ code }) as unknown as ORPCError<string, unknown>;

  // A report shown at a break by its checks, `ago` before now, with a photo that is ready.
  async function shown(
    id: string,
    options: { by?: string; breakId?: string; ago?: number; state?: "published" | "hidden" } = {},
  ) {
    const sent = new Date(Date.now() - (options.ago ?? 20 * 60 * 1000));
    await database.db.insert(surfReport).values({
      id,
      userId: options.by ?? "ana",
      breakId: options.breakId ?? "point",
      state: options.state ?? "published",
      waveSize: "chest",
      note: "Clean sets.",
      terms: "2026-10-19",
      createdAt: sent,
      publishedAt: sent,
    });
    await database.db.insert(media).values({
      id: `${id}-photo`,
      userId: options.by ?? "ana",
      purpose: "report",
      kind: "photo",
      state: "ready",
      reportId: id,
      uploadKey: `up/${id}`,
      uploadType: "image/jpeg",
      uploadBytes: 3,
      files: {
        thumb: {
          key: `m/${id}/0/thumb.webp`,
          contentType: "image/webp",
          bytes: 3,
          width: 4,
          height: 3,
        },
      },
    });
  }

  // A notice of some reports, as the worker writes one.
  async function notice(id: string, userId: string, reportIds: string[], breakId = "point") {
    await database.db.insert(reportNotice).values({
      id,
      userId,
      breakId,
      createdAt: new Date(),
      updatedAt: new Date(),
      told: reportIds.length,
    });
    if (reportIds.length > 0) {
      await database.db
        .insert(reportNoticeReport)
        .values(reportIds.map((reportId) => ({ noticeId: id, reportId })));
    }
  }

  describe("the counts", () => {
    it("counts each view and each opened photo of a report that is shown, never its author's", async () => {
      await shown("seen");
      await shown("hidden", { state: "hidden" });
      expect(
        await call(v1Router.reports.seen, { ids: ["seen", "hidden", "nothing"] }, by(null)),
      ).toEqual({ counted: 1 });
      expect(await call(v1Router.reports.seen, { ids: ["seen"] }, by("ben"))).toEqual({
        counted: 1,
      });
      // Its author's own browser counts nothing.
      expect(await call(v1Router.reports.seen, { ids: ["seen"] }, by("ana"))).toEqual({
        counted: 0,
      });
      expect(await call(v1Router.reports.opened, { id: "seen" }, by("ben"))).toEqual({
        counted: 1,
      });

      const mine = await call(v1Router.reports.list, { breakId: "point" }, by("ana"));
      expect(mine.reports.find((one) => one.id === "seen")?.stats).toEqual({
        views: 2,
        opens: 1,
        told: 0,
      });
      // Nobody else reads them.
      const theirs = await call(v1Router.reports.list, { breakId: "point" }, by("ben"));
      expect(theirs.reports[0]?.stats).toBeNull();
      const visitor = await call(v1Router.reports.list, { breakId: "point" }, by(null));
      expect(visitor.reports[0]?.stats).toBeNull();
    });

    it("counts a caller's calls an hour, and none past them", async () => {
      await shown("seen");
      for (let turn = 0; turn < REPORT_COUNTS_AN_HOUR; turn += 1) {
        await call(v1Router.reports.seen, { ids: ["seen"] }, by(null));
      }
      expect(await call(v1Router.reports.seen, { ids: ["seen"] }, by(null))).toEqual({
        counted: 0,
      });
      // Another address is another caller.
      expect(
        await call(v1Router.reports.seen, { ids: ["seen"] }, by(null, WEB, "198.51.100.9")),
      ).toEqual({ counted: 1 });
    });
  });

  describe("the notices", () => {
    it("lists the caller's notices with the newest report still shown, and what became of the others", async () => {
      await shown("first", { ago: 2 * HOUR });
      await shown("second", { by: "cy" });
      await shown("old", { ago: 8 * 24 * HOUR });
      await shown("gone", { state: "hidden" });
      await notice("now", "ben", ["first", "second"]);
      vi.setSystemTime(new Date(AT.getTime() + 60_000));
      await notice("past", "ben", ["old"], "reef");
      vi.setSystemTime(new Date(AT.getTime() + 120_000));
      await notice("removed", "ben", ["gone"]);
      await notice("other", "cy", ["first"]);

      const listed = await call(v1Router.reportNotices.list, {}, by("ben"));
      expect(listed.unread).toBe(3);
      expect(listed.notices.map((one) => [one.id, one.state, one.shown])).toEqual([
        ["removed", "removed", 0],
        ["past", "past", 0],
        ["now", "shown", 2],
      ]);
      const [, past, now] = listed.notices;
      expect(past).toMatchObject({ breakName: "The reef", latest: null });
      expect(now).toMatchObject({
        breakName: "The point",
        told: 2,
        latest: { reportId: "second", author: "cy", waveSize: "chest", note: "Clean sets." },
      });
      expect(now?.latest?.thumb).toContain("m/second/0/thumb.webp");
    });

    it("pages the notices, and counts the unread ones of every page", async () => {
      await shown("first");
      for (const [index, id] of ["a", "b", "c"].entries()) {
        vi.setSystemTime(new Date(AT.getTime() + index * 60_000));
        await notice(id, "ben", ["first"]);
      }
      const first = await call(v1Router.reportNotices.list, { limit: 2 }, by("ben"));
      expect(first.notices.map((one) => one.id)).toEqual(["c", "b"]);
      expect(first.unread).toBe(3);
      expect(first.next).toEqual({ at: new Date(AT.getTime() + 60_000), id: "b" });
      const second = await call(
        v1Router.reportNotices.list,
        { limit: 2, before: first.next!.at, beforeId: first.next!.id },
        by("ben"),
      );
      expect(second.notices.map((one) => one.id)).toEqual(["a"]);
      expect(second.next).toBeNull();
    });

    it("marks a notice read, its own account's alone", async () => {
      await shown("first");
      await notice("now", "ben", ["first"]);
      await expect(call(v1Router.reportNotices.markRead, { id: "now" }, by("cy"))).rejects.toEqual(
        refusal("NOT_FOUND"),
      );
      const read = await call(v1Router.reportNotices.markRead, { id: "now" }, by("ben"));
      expect(read.readAt).toEqual(AT);
      // The first reading keeps its time.
      vi.setSystemTime(new Date(AT.getTime() + HOUR));
      expect(await call(v1Router.reportNotices.markRead, { id: "now" }, by("ben"))).toEqual(read);
      expect(await call(v1Router.reportNotices.list, { unreadOnly: true }, by("ben"))).toEqual({
        notices: [],
        unread: 0,
        next: null,
      });
    });
  });

  describe("the switches", () => {
    it("switches the reports of a list for its owner, and of a kept list for its member alone", async () => {
      const at = new Date("2026-10-01T00:00:00Z");
      await database.db.insert(stationList).values({
        id: "shared",
        userId: "ana",
        name: "Shared",
        createdAt: at,
        updatedAt: at,
      });
      await database.db.insert(stationListBreak).values({ listId: "shared", breakId: "point" });
      await database.db.insert(stationListMember).values({ listId: "shared", userId: "ben" });

      expect(await call(v1Router.lists.reports, { id: "shared", on: false }, by("ben"))).toEqual({
        id: "shared",
        reportsOn: false,
      });
      // The owner's switch is its own, and the list did not change.
      const owned = await call(v1Router.lists.list, undefined, by("ana"));
      expect(owned.lists[0]).toMatchObject({ reportsOn: true, updatedAt: at });
      const kept = await call(v1Router.lists.list, undefined, by("ben"));
      expect(kept.joined[0]).toMatchObject({ id: "shared", reportsOn: false });
      expect(await call(v1Router.lists.view, { id: "shared" }, by("ben"))).toMatchObject({
        access: "member",
        reportsOn: false,
      });

      await call(v1Router.lists.reports, { id: "shared", on: false }, by("ana"));
      expect((await call(v1Router.lists.list, undefined, by("ana"))).lists[0]).toMatchObject({
        reportsOn: false,
        updatedAt: at,
      });
      await expect(
        call(v1Router.lists.reports, { id: "shared", on: true }, by("cy")),
      ).rejects.toEqual(refusal("NOT_FOUND"));
    });

    it("switches the reports off for the account, with its alerts' settings", async () => {
      expect(await call(v1Router.alerts.getSettings, undefined, by("ben"))).toMatchObject({
        onReports: true,
      });
      await call(v1Router.alerts.updateSettings, { onReports: false }, by("ben"));
      expect(await call(v1Router.alerts.getSettings, undefined, by("ben"))).toMatchObject({
        onReports: false,
      });
      const [row] = await database.db
        .select()
        .from(alertSettings)
        .where(eq(alertSettings.userId, "ben"));
      expect(row?.onReports).toBe(false);
    });

    it("keeps the first moment a report was shown when an operator shows it again", async () => {
      await shown("first");
      const [before] = await database.db
        .select({ publishedAt: surfReport.publishedAt })
        .from(surfReport)
        .where(eq(surfReport.id, "first"));
      await database.db
        .update(surfReport)
        .set({ state: "hidden" })
        .where(eq(surfReport.id, "first"));
      vi.setSystemTime(new Date(AT.getTime() + HOUR));
      await call(v1Router.reports.decide, { id: "first", decision: "publish" }, by("op", ADMIN));
      const [after] = await database.db
        .select({ publishedAt: surfReport.publishedAt, state: surfReport.state })
        .from(surfReport)
        .where(eq(surfReport.id, "first"));
      expect(after).toEqual({ publishedAt: before?.publishedAt, state: "published" });
    });
  });
});
