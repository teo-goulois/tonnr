import { call, ORPCError } from "@orpc/server";
import type { Session } from "@repo/auth";
import { REPORT_TERMS } from "@repo/config/media";
import { operator, operatorAction } from "@repo/db/schema/access";
import { user } from "@repo/db/schema/auth";
import { media, mediaTrash } from "@repo/db/schema/media";
import { surfReport, surfReportFlag } from "@repo/db/schema/reports";
import { surfBreak } from "@repo/db/schema/spots";
import { createTestDatabase, TEST_DATABASE_URL } from "@repo/db/testing";
import { testStorage, type TestStorage } from "@repo/media/testing";
import { eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Context } from "./context";
import { v1Router } from "./routers/index";
import { testForecasts, testPlaces, testVerification } from "./testing";
import { createUsage, type Usage } from "./usage";

const MB = 1024 * 1024;

// The reports of the waves at a break: decision 067.
describe.skipIf(!TEST_DATABASE_URL)("the reports of the waves at a break", () => {
  const WEB = "https://app.example.org";
  const ADMIN = "https://admin.example.org";
  const AT = new Date("2026-10-18T10:00:00Z");
  const BREAK = { latitude: 43.4832, longitude: -1.5586 };
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let usage: Usage;
  let storage: TestStorage;

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
    await db.delete(mediaTrash);
    const old = new Date("2026-09-01T00:00:00Z");
    await db.insert(user).values([
      { id: "ana", name: "Ana", email: "ana@example.org", username: "ana", createdAt: old },
      { id: "ben", name: "Ben", email: "ben@example.org", username: "ben", createdAt: old },
      { id: "cy", name: "Cy", email: "cy@example.org", username: "cy", createdAt: old },
      { id: "dee", name: "Dee", email: "dee@example.org", username: "dee", createdAt: old },
      { id: "new", name: "New", email: "new@example.org", username: "new", createdAt: AT },
      { id: "nameless", name: "Nameless", email: "n@example.org", createdAt: old },
    ]);
    await db.insert(surfBreak).values([
      { id: "point", slug: "point", name: "The point", ...BREAK },
      { id: "reef", slug: "reef", name: "The reef", latitude: 43.5, longitude: -1.6 },
    ]);
  });

  const by = (id: string | null, site = WEB) => {
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

  // A photo sent for a report, as a browser sends it.
  async function sent(who: string) {
    const asked = await call(
      v1Router.media.prepare,
      { purpose: "report", contentType: "image/jpeg", bytes: 2 * MB },
      by(who),
    );
    storage.put(`up/${asked.id}`, new Uint8Array(2 * MB), "image/jpeg");
    await call(v1Router.media.uploaded, { id: asked.id }, by(who));
    return asked.id;
  }
  const report = async (who: string, breakId = "point", extra = {}) =>
    call(
      v1Router.reports.create,
      {
        breakId,
        mediaIds: [await sent(who)],
        waveSize: "chest",
        note: "Clean sets on the outside.",
        device: { ...BREAK, accuracyM: 12 },
        offsetMinutes: -120,
        terms: REPORT_TERMS,
        ...extra,
      },
      by(who),
    );
  const publish = (id: string) =>
    database.db.update(surfReport).set({ state: "published" }).where(eq(surfReport.id, id));

  it("takes a report with its photos, to be checked, and keeps where the phone stood", async () => {
    const made = await report("ana");
    expect(made).toMatchObject({
      author: "ana",
      mine: true,
      state: "checking",
      waveSize: "chest",
      note: "Clean sets on the outside.",
      reasons: [],
    });
    expect(made.media).toHaveLength(1);
    const [row] = await database.db.select().from(surfReport).where(eq(surfReport.id, made.id));
    expect(row).toMatchObject({
      deviceLatitude: BREAK.latitude,
      offsetMinutes: -120,
      terms: REPORT_TERMS,
      createdAt: AT,
    });
    const [kept] = await database.db.select().from(media).where(eq(media.reportId, made.id));
    expect(kept).toMatchObject({ purpose: "report", position: 0, state: "uploaded" });
  });

  it("refuses an account with no username, a photo of a session, and a photo not yet sent", async () => {
    await expect(report("nameless")).rejects.toEqual(refusal("FORBIDDEN"));
    const forSession = await call(
      v1Router.media.prepare,
      { purpose: "session", contentType: "image/jpeg", bytes: 1000 },
      by("ana"),
    );
    storage.put(`up/${forSession.id}`, new Uint8Array(1000), "image/jpeg");
    await call(v1Router.media.uploaded, { id: forSession.id }, by("ana"));
    const asking = { breakId: "point", terms: REPORT_TERMS } as const;
    await expect(
      call(v1Router.reports.create, { ...asking, mediaIds: [forSession.id] }, by("ana")),
    ).rejects.toEqual(refusal("CONFLICT"));
    const waiting = await call(
      v1Router.media.prepare,
      { purpose: "report", contentType: "image/jpeg", bytes: 1000 },
      by("ana"),
    );
    await expect(
      call(v1Router.reports.create, { ...asking, mediaIds: [waiting.id] }, by("ana")),
    ).rejects.toEqual(refusal("CONFLICT"));
    // Another account's photo is not there for it.
    await expect(
      call(v1Router.reports.create, { ...asking, mediaIds: [await sent("ben")] }, by("ana")),
    ).rejects.toEqual(refusal("NOT_FOUND"));
    // A note that leads elsewhere is refused before anything.
    await expect(report("ana", "point", { note: "Better at www.example.com" })).rejects.toEqual(
      refusal("BAD_REQUEST"),
    );
  });

  it("takes one report an hour at a break, and ten a day", async () => {
    await report("ana");
    await expect(report("ana")).rejects.toEqual(refusal("TOO_MANY_REQUESTS"));
    await report("ana", "reef");
    for (let hour = 1; hour <= 8; hour += 1) {
      vi.setSystemTime(new Date(AT.getTime() + hour * 61 * 60 * 1000));
      await report("ana");
    }
    vi.setSystemTime(new Date(AT.getTime() + 10 * 61 * 60 * 1000));
    await expect(report("ana", "reef")).rejects.toEqual(refusal("TOO_MANY_REQUESTS"));
  });

  it("gives nothing back of the limits for a report that is deleted", async () => {
    const made = await report("ana");
    await call(v1Router.reports.delete, { id: made.id }, by("ana"));
    await expect(report("ana")).rejects.toEqual(refusal("TOO_MANY_REQUESTS"));
  });

  it("pages the operator's list by moment and id, so that reports of one moment are all read", async () => {
    await database.db.insert(operator).values({ userId: "dee" });
    const one = await report("ana");
    const two = await report("ben");
    const first = await call(v1Router.reports.review, { limit: 1 }, by("dee", ADMIN));
    expect(first.next).not.toBeNull();
    const second = await call(
      v1Router.reports.review,
      { limit: 1, before: first.next!.at, beforeId: first.next!.id },
      by("dee", ADMIN),
    );
    expect([first.reports[0]?.id, second.reports[0]?.id].sort()).toEqual([one.id, two.id].sort());
    expect(second.next).toBeNull();
  });

  it("shows everyone what is shown, and its author what became of the rest", async () => {
    const shown = await report("ana");
    const checking = await report("ben");
    const refused = await report("cy");
    await publish(shown.id);
    await database.db
      .update(surfReport)
      .set({ state: "refused" })
      .where(eq(surfReport.id, refused.id));
    await database.db
      .update(media)
      .set({
        state: "ready",
        checks: {
          position: {
            source: "file",
            distanceKm: 7,
            accuracyM: null,
            point: null,
            reason: "too_far",
          },
          time: { source: "gps", takenAt: AT.toISOString(), ageMinutes: 0, reason: null },
          analysis: null,
          verdict: "refused",
          reasons: ["too_far"],
        },
      })
      .where(eq(media.reportId, refused.id));

    const asVisitor = await call(v1Router.reports.list, { breakId: "point" }, by(null));
    expect(asVisitor.offered).toBe(true);
    expect(asVisitor.reports.map((one) => one.id)).toEqual([shown.id]);
    expect(asVisitor.reports[0]).toMatchObject({ mine: false, reasons: [], author: "ana" });

    const asCy = await call(v1Router.reports.list, { breakId: "point" }, by("cy"));
    // Sent at the same moment, they come in no order of their own.
    expect(asCy.reports.map((one) => [one.id, one.state]).sort()).toEqual(
      [
        [refused.id, "refused"],
        [shown.id, "published"],
      ].sort(),
    );
    expect(asCy.reports.find((one) => one.id === refused.id)).toMatchObject({
      reasons: ["too_far"],
      distanceKm: 7,
    });
    expect(asCy.reports.some((one) => one.id === checking.id)).toBe(false);

    // A week later, nothing is shown, and nothing is deleted.
    vi.setSystemTime(new Date(AT.getTime() + 7 * 24 * 60 * 60 * 1000 + 60_000));
    expect((await call(v1Router.reports.list, { breakId: "point" }, by(null))).reports).toEqual([]);
    expect(await database.db.select().from(surfReport)).toHaveLength(3);
  });

  it("hides a report three accounts flagged, and lets none of them flag twice", async () => {
    const shown = await report("ana");
    await publish(shown.id);
    // Its author does not flag it.
    await expect(
      call(v1Router.reports.flag, { id: shown.id, reason: "not_here" }, by("ana")),
    ).rejects.toEqual(refusal("NOT_FOUND"));
    // An account under a day old, or with no username, is heard and hides nothing.
    expect(
      await call(v1Router.reports.flag, { id: shown.id, reason: "offensive" }, by("new")),
    ).toEqual({ hidden: false });
    expect(
      await call(v1Router.reports.flag, { id: shown.id, reason: "offensive" }, by("nameless")),
    ).toEqual({ hidden: false });
    expect(
      await call(v1Router.reports.flag, { id: shown.id, reason: "not_sea" }, by("ben")),
    ).toEqual({
      hidden: false,
    });
    expect(
      await call(v1Router.reports.flag, { id: shown.id, reason: "not_sea" }, by("ben")),
    ).toEqual({
      hidden: false,
    });
    await call(v1Router.reports.flag, { id: shown.id, reason: "not_now" }, by("cy"));
    expect(await call(v1Router.reports.flag, { id: shown.id, reason: "other" }, by("dee"))).toEqual(
      {
        hidden: true,
      },
    );
    const [row] = await database.db.select().from(surfReport).where(eq(surfReport.id, shown.id));
    expect(row?.state).toBe("hidden");
    const flags = await database.db
      .select({ userId: surfReportFlag.userId, counts: surfReportFlag.counts })
      .from(surfReportFlag);
    expect(flags.sort((a, b) => a.userId.localeCompare(b.userId))).toEqual([
      { userId: "ben", counts: true },
      { userId: "cy", counts: true },
      { userId: "dee", counts: true },
      { userId: "nameless", counts: false },
      { userId: "new", counts: false },
    ]);
  });

  it("hides nothing with the flags of accounts that do not count, which come to an operator", async () => {
    const shown = await report("ana");
    await publish(shown.id);
    await database.db.insert(user).values([
      { id: "young", name: "Young", email: "young@example.org", username: "young", createdAt: AT },
      { id: "nobody", name: "Nobody", email: "nobody@example.org", createdAt: AT },
    ]);
    for (const id of ["new", "nameless", "young", "nobody"]) {
      expect(
        await call(v1Router.reports.flag, { id: shown.id, reason: "offensive" }, by(id)),
      ).toEqual({ hidden: false });
    }
    const [row] = await database.db.select().from(surfReport).where(eq(surfReport.id, shown.id));
    expect(row?.state).toBe("published");

    await database.db.insert(operator).values({ userId: "dee" });
    const reviewed = await call(v1Router.reports.review, { state: "flagged" }, by("dee", ADMIN));
    expect(reviewed.reports[0]?.flags).toMatchObject({ count: 4, counted: 0 });
  });

  it("lets an operator read every check and decide, and records what it decided", async () => {
    await database.db.insert(operator).values({ userId: "dee" });
    const hidden = await report("ana");
    await database.db
      .update(surfReport)
      .set({ state: "hidden" })
      .where(eq(surfReport.id, hidden.id));
    await database.db.insert(surfReportFlag).values([
      {
        reportId: hidden.id,
        userId: "ben",
        reason: "not_sea",
        createdAt: new Date(AT.getTime() - 60_000),
      },
      {
        reportId: hidden.id,
        userId: "cy",
        reason: "not_sea",
        createdAt: new Date(AT.getTime() - 60_000),
      },
    ]);
    await expect(
      call(v1Router.reports.review, { state: "flagged" }, by("ana", ADMIN)),
    ).rejects.toEqual(refusal("FORBIDDEN"));
    await expect(call(v1Router.reports.review, {}, by("dee"))).rejects.toEqual(
      refusal("FORBIDDEN"),
    );

    expect(await call(v1Router.reports.waiting, undefined, by("dee", ADMIN))).toEqual({
      review: 0,
      hidden: 1,
    });
    const reviewed = await call(v1Router.reports.review, { state: "flagged" }, by("dee", ADMIN));
    expect(reviewed.reports).toHaveLength(1);
    expect(reviewed.reports[0]).toMatchObject({
      id: hidden.id,
      authorId: "ana",
      breakName: "The point",
      flags: { count: 2, reasons: ["not_sea", "not_sea"] },
      device: { latitude: BREAK.latitude, longitude: BREAK.longitude, accuracyM: 12 },
    });

    expect(
      await call(v1Router.reports.decide, { id: hidden.id, decision: "publish" }, by("dee", ADMIN)),
    ).toEqual({ state: "published" });
    // The flags before count no more: one more does not hide it again.
    vi.setSystemTime(new Date(AT.getTime() + 60_000));
    await call(v1Router.reports.flag, { id: hidden.id, reason: "not_sea" }, by("dee"));
    const [row] = await database.db.select().from(surfReport).where(eq(surfReport.id, hidden.id));
    expect(row?.state).toBe("published");

    await call(v1Router.reports.decide, { id: hidden.id, decision: "remove" }, by("dee", ADMIN));
    const done = await database.db
      .select()
      .from(operatorAction)
      .where(inArray(operatorAction.action, ["report.publish", "report.remove"]))
      .orderBy(operatorAction.at);
    expect(done.map((one) => [one.action, one.accountId])).toEqual([
      ["report.publish", "ana"],
      ["report.remove", "ana"],
    ]);
    expect((await call(v1Router.reports.list, { breakId: "point" }, by("ana"))).reports).toEqual(
      [],
    );
  });

  it("deletes a report with its photos, and leaves the files to the trash", async () => {
    const made = await report("ana");
    const [kept] = await database.db.select().from(media).where(eq(media.reportId, made.id));
    // Its photo is not deleted apart.
    await expect(call(v1Router.media.discard, { id: kept!.id }, by("ana"))).rejects.toEqual(
      refusal("NOT_FOUND"),
    );
    await expect(call(v1Router.reports.delete, { id: made.id }, by("ben"))).rejects.toEqual(
      refusal("NOT_FOUND"),
    );
    await call(v1Router.reports.delete, { id: made.id }, by("ana"));
    expect(await database.db.select().from(media)).toEqual([]);
    const trash = await database.db.select().from(mediaTrash);
    expect(trash.flatMap((row) => row.keys)).toEqual([`up/${kept!.id}`]);
  });
});
