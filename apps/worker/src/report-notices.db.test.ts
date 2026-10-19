import { readAppLink } from "@repo/config/links";
import { accountSuspension } from "@repo/db/schema/access";
import { alertSettings, pushSubscription } from "@repo/db/schema/alerts";
import { user } from "@repo/db/schema/auth";
import { accountBlock } from "@repo/db/schema/community";
import {
  stationList,
  stationListBreak,
  stationListMember,
  stationListSpot,
} from "@repo/db/schema/lists";
import { providerCalls } from "@repo/db/schema/forecasts";
import { media } from "@repo/db/schema/media";
import { reportNotice, reportNoticeReport, surfReport } from "@repo/db/schema/reports";
import { spot, surfBreak } from "@repo/db/schema/spots";
import { createTestDatabase, TEST_DATABASE_URL } from "@repo/db/testing";
import { testStorage } from "@repo/media/testing";
import { testPusher } from "@repo/push/testing";
import { and, asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { PushOut } from "./deliveries";
import {
  ACCOUNT_DAILY_REPORT_PUSHES,
  handNoticePush,
  isWorthTelling,
  runReportNotices,
  takeNoticePush,
} from "./report-notices";

const HOUR = 60 * 60 * 1000;
// Ten in the morning in Biarritz, out of the default quiet hours.
const AT = new Date("2026-10-18T08:00:00Z");

describe("whether a report is told", () => {
  it("tells one first shown within two hours of being sent, while it is under three hours old", () => {
    const sent = new Date(AT.getTime() - HOUR);
    expect(isWorthTelling({ createdAt: sent, publishedAt: AT }, AT)).toBe(true);
    // Shown by an operator two hours and a half after it was sent.
    expect(
      isWorthTelling({ createdAt: new Date(AT.getTime() - 2.5 * HOUR), publishedAt: AT }, AT),
    ).toBe(false);
    // Shown at once, but told only once the worker came back three hours later.
    expect(
      isWorthTelling({ createdAt: sent, publishedAt: sent }, new Date(AT.getTime() + 2.5 * HOUR)),
    ).toBe(false);
    // Shown before this version, which says no moment.
    expect(isWorthTelling({ createdAt: sent, publishedAt: null }, AT)).toBe(false);
  });
});

// What a report shown at a break tells the accounts that keep it: decision 068.
describe.skipIf(!TEST_DATABASE_URL)("the notices of reports", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let service: ReturnType<typeof testPusher>;
  let out: PushOut;
  let storage: ReturnType<typeof testStorage>;

  beforeAll(async () => {
    database = await createTestDatabase();
  });
  afterAll(() => database?.drop());
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(AT);
    service = testPusher();
    out = { pusher: service.pusher, webOrigin: "https://app.example.org" };
    storage = testStorage();
    const db = database.db;
    await db.delete(user);
    await db.delete(surfBreak);
    // An account's pushes of the day are counted by the database's own day.
    await db.delete(providerCalls);
    const accounts = ["author", "keeper", "member", "spotter", "off", "listoff", "away", "out"];
    await db
      .insert(user)
      .values(accounts.map((id) => ({ id, name: id, email: `${id}@example.org`, username: id })));
    await db.insert(surfBreak).values([
      { id: "point", slug: "point", name: "La Point", latitude: 43.48, longitude: -1.56 },
      { id: "other", slug: "other", name: "Other", latitude: 44, longitude: -1.3 },
    ]);
    // Who keeps the break, and how.
    await db.insert(stationList).values([
      { id: "favorites", userId: "keeper", name: "Favorites", isDefault: true },
      { id: "shared", userId: "author", name: "Shared" },
      { id: "quiet", userId: "listoff", name: "Quiet", reportsOn: false },
      { id: "off-list", userId: "off", name: "Mine" },
      { id: "away-list", userId: "away", name: "Mine" },
      { id: "out-list", userId: "out", name: "Mine" },
    ]);
    await db.insert(stationListBreak).values(
      ["favorites", "shared", "quiet", "off-list", "away-list", "out-list"].map((listId) => ({
        listId,
        breakId: "point",
      })),
    );
    await db.insert(stationListMember).values({ listId: "shared", userId: "member" });
    await db.insert(spot).values({
      id: "mine",
      userId: "spotter",
      breakId: "point",
      name: "My point",
      latitude: 43.48,
      longitude: -1.56,
    });
    await db.insert(alertSettings).values([
      { userId: "off", onReports: false },
      { userId: "away", awayUntil: new Date(AT.getTime() + 24 * HOUR) },
    ]);
    await db.insert(accountSuspension).values({ userId: "out" });
  });

  // A report as the checks leave it: shown at once, sent `ago` before now, with a ready photo.
  async function shown(id: string, options: { ago?: number; breakId?: string; by?: string } = {}) {
    const sent = new Date(Date.now() - (options.ago ?? 10 * 60 * 1000));
    await database.db.insert(surfReport).values({
      id,
      userId: options.by ?? "author",
      breakId: options.breakId ?? "point",
      state: "published",
      waveSize: "shoulder",
      note: "Clean sets on the outside",
      terms: "2026-10-19",
      createdAt: sent,
      checkedAt: new Date(),
      publishedAt: new Date(),
    });
    storage.put(`m/${id}/0/thumb.webp`, new Uint8Array([1, 2, 3]), "image/webp");
    await database.db.insert(media).values({
      id: `${id}-photo`,
      userId: options.by ?? "author",
      purpose: "report",
      kind: "photo",
      state: "ready",
      reportId: id,
      position: 0,
      uploadKey: `up/${id}-photo`,
      uploadType: "image/jpeg",
      uploadBytes: 3,
      files: {
        thumb: {
          key: `m/${id}/0/thumb.webp`,
          contentType: "image/webp",
          bytes: 3,
          width: 480,
          height: 320,
        },
      },
    });
  }

  const device = async (userId: string) => {
    const made = service.device();
    await database.db.insert(pushSubscription).values({ id: `${userId}-device`, userId, ...made });
  };
  const run = (push: PushOut | null = out) => runReportNotices(database.db, { push, storage });
  const notices = () =>
    database.db
      .select()
      .from(reportNotice)
      .orderBy(asc(reportNotice.userId), asc(reportNotice.createdAt));
  const membersOf = async (noticeId: string) =>
    (
      await database.db
        .select({ reportId: reportNoticeReport.reportId })
        .from(reportNoticeReport)
        .where(eq(reportNoticeReport.noticeId, noticeId))
    ).map((one) => one.reportId);

  it("tells the accounts that keep the break, by a list, a kept list or a spot, and no other", async () => {
    await shown("first");
    const done = await run();
    expect(done).toMatchObject({ reports: 1, accounts: 3 });
    expect((await notices()).map((one) => one.userId)).toEqual(["keeper", "member", "spotter"]);
    const [report] = await database.db.select().from(surfReport).where(eq(surfReport.id, "first"));
    expect(report).toMatchObject({ told: 3 });
    expect(report?.announcedAt).not.toBeNull();
    // Told once: a second run tells it to nobody.
    expect(await run()).toMatchObject({ reports: 0, accounts: 0 });
    expect(await notices()).toHaveLength(3);
  });

  it("tells a member whose list holds a spot of its owner made from the break", async () => {
    await database.db.delete(stationListBreak).where(eq(stationListBreak.listId, "shared"));
    await database.db.insert(spot).values({
      id: "owner-spot",
      userId: "author",
      breakId: "point",
      name: "Owner's",
      latitude: 43.48,
      longitude: -1.56,
    });
    await database.db.insert(stationListSpot).values({ listId: "shared", spotId: "owner-spot" });
    await shown("first", { by: "keeper" });
    await run();
    // The author of this one is the keeper, who is not told of it, and the list's owner keeps
    // the break by its own spot.
    expect((await notices()).map((one) => one.userId)).toEqual(["author", "member", "spotter"]);
  });

  it("does not tell a report shown long after it was sent, nor one shown before this version", async () => {
    await shown("late", { ago: 3 * HOUR });
    await shown("before");
    await database.db
      .update(surfReport)
      .set({ publishedAt: null })
      .where(eq(surfReport.id, "before"));
    expect(await run()).toMatchObject({ reports: 2, accounts: 0 });
    expect(await notices()).toHaveLength(0);
  });

  it("joins the reports of three hours in one notice, unread again, and begins another after", async () => {
    await shown("first");
    await run();
    const [kept] = (await notices()).filter((one) => one.userId === "keeper");
    await database.db
      .update(reportNotice)
      .set({ readAt: new Date() })
      .where(eq(reportNotice.id, kept!.id));

    vi.setSystemTime(new Date(AT.getTime() + HOUR));
    await shown("second");
    await run();
    const [joined] = (await notices()).filter((one) => one.userId === "keeper");
    expect(joined).toMatchObject({ id: kept!.id, told: 2, readAt: null });
    expect((await membersOf(kept!.id)).toSorted()).toEqual(["first", "second"]);

    vi.setSystemTime(new Date(AT.getTime() + 3 * HOUR + 60_000));
    await shown("third");
    await run();
    const keeper = (await notices()).filter((one) => one.userId === "keeper");
    expect(keeper).toHaveLength(2);
    expect(await membersOf(keeper[1]!.id)).toEqual(["third"]);
  });

  it("pushes a notice once, to every browser, with the break, the newest report and its photo", async () => {
    await device("keeper");
    await shown("first");
    const done = await run();
    expect(done).toMatchObject({ sent: 1 });
    const [sent] = service.sent();
    const [notice] = (await notices()).filter((one) => one.userId === "keeper");
    expect(sent?.push).toMatchObject({
      title: "New report at La Point",
      body: "author · Shoulder · “Clean sets on the outside”",
      url: `https://app.example.org/app?break=point&tab=reports&notice=${notice!.id}`,
      tag: "report-point",
    });
    // Pressed on a phone with the app, it opens the break's reports there: decision 073.
    expect(readAppLink(sent?.push.url ?? "", out.webOrigin)).toEqual({
      screen: "map",
      search: { break: "point", tab: "reports", notice: notice!.id },
    });
    expect(sent?.push.image).toContain("m/first/0/thumb.webp");
    // Kept by a push service until the report is three hours old.
    expect(sent?.keepSeconds).toBeGreaterThan(2.5 * 60 * 60);
    expect(notice).toMatchObject({ pushState: "sent" });
    // An account that set nothing was given its settings' row, so that its first change waits for
    // a push being handed over.
    expect(
      await database.db.select().from(alertSettings).where(eq(alertSettings.userId, "keeper")),
    ).toHaveLength(1);
    // An account with no browser has its notice, and no push.
    const [member] = (await notices()).filter((one) => one.userId === "member");
    expect(member).toMatchObject({ pushState: null });

    // A report that joins the notice adds no push.
    vi.setSystemTime(new Date(AT.getTime() + HOUR));
    await shown("second");
    await run();
    expect(service.sent()).toHaveLength(1);
  });

  it("says every report that joined a push that waits, which leaves at the end of the quiet hours", async () => {
    // Half past five in the morning in Biarritz.
    vi.setSystemTime(new Date("2026-10-18T03:30:00Z"));
    await database.db.insert(alertSettings).values({ userId: "keeper", zone: "Europe/Paris" });
    await device("keeper");
    await shown("first");
    await run();
    expect(service.sent()).toHaveLength(0);
    const [waiting] = (await notices()).filter((one) => one.userId === "keeper");
    expect(waiting?.dueAt).toEqual(new Date("2026-10-18T05:00:00Z"));

    vi.setSystemTime(new Date("2026-10-18T04:15:00Z"));
    await shown("second");
    await run();
    vi.setSystemTime(new Date("2026-10-18T05:00:00Z"));
    await run();
    const [sent] = service.sent();
    expect(sent?.push.title).toBe("2 reports at La Point");
  });

  it("gives a push up when its report is too old by the end of the quiet hours", async () => {
    vi.setSystemTime(new Date("2026-10-18T01:00:00Z"));
    await database.db.insert(alertSettings).values({ userId: "keeper", zone: "Europe/Paris" });
    await device("keeper");
    await shown("night");
    await run();
    vi.setSystemTime(new Date("2026-10-18T05:00:00Z"));
    expect(await run()).toMatchObject({ sent: 0, expired: 1 });
    expect(service.sent()).toHaveLength(0);
  });

  it("gives a push up when the newer report that kept it worth sending was hidden", async () => {
    vi.setSystemTime(new Date("2026-10-18T01:00:00Z"));
    await database.db.insert(alertSettings).values({ userId: "keeper", zone: "Europe/Paris" });
    await device("keeper");
    await shown("night");
    await run();
    vi.setSystemTime(new Date("2026-10-18T04:00:00Z"));
    await shown("dawn");
    await run();
    await database.db.update(surfReport).set({ state: "hidden" }).where(eq(surfReport.id, "dawn"));
    // At the end of the quiet hours, the report still shown is four hours old.
    vi.setSystemTime(new Date("2026-10-18T05:00:00Z"));
    expect(await run()).toMatchObject({ sent: 0, expired: 1 });
    expect(service.sent()).toHaveLength(0);
  });

  it("writes a push anew when a report joined it between its two steps, and counts it once", async () => {
    await device("keeper");
    await database.db.insert(alertSettings).values({
      userId: "keeper",
      quietFrom: 0,
      quietTo: 23 * 60 + 59,
    });
    await shown("first");
    await run();
    await database.db
      .update(alertSettings)
      .set({ quietFrom: null, quietTo: null })
      .where(eq(alertSettings.userId, "keeper"));
    const [notice] = (await notices()).filter((one) => one.userId === "keeper");
    const taken = await takeNoticePush(database.db, out, notice!.id);
    if (typeof taken === "string") throw new Error(`taken: ${taken}`);
    await shown("second");
    await database.db
      .insert(reportNoticeReport)
      .values({ noticeId: notice!.id, reportId: "second" });
    expect(await handNoticePush(database.db, out, storage, notice!.id, taken)).toBe("skipped");
    expect(service.sent()).toHaveLength(0);
    // Put back worth as long as the newest report it holds now.
    const [second] = await database.db
      .select({ createdAt: surfReport.createdAt })
      .from(surfReport)
      .where(eq(surfReport.id, "second"));
    const [waiting] = await database.db
      .select()
      .from(reportNotice)
      .where(eq(reportNotice.id, notice!.id));
    expect(waiting).toMatchObject({
      pushState: "pending",
      expiresAt: new Date(second!.createdAt.getTime() + 3 * HOUR),
    });
    expect(waiting?.countedAt).not.toBeNull();
    expect(await run()).toMatchObject({ sent: 1 });
    expect(service.sent()[0]?.push.title).toBe("2 reports at La Point");
    const counted = await database.db.select().from(providerCalls);
    expect(counted.map((one) => [one.provider, one.calls])).toEqual([["report-push:keeper", 1]]);
  });

  it("writes a push anew when its break was merged into another between its two steps", async () => {
    await device("keeper");
    await shown("first");
    await database.db.insert(alertSettings).values({
      userId: "keeper",
      quietFrom: 0,
      quietTo: 23 * 60 + 59,
    });
    await run();
    await database.db
      .update(alertSettings)
      .set({ quietFrom: null, quietTo: null })
      .where(eq(alertSettings.userId, "keeper"));
    const [notice] = (await notices()).filter((one) => one.userId === "keeper");
    const taken = await takeNoticePush(database.db, out, notice!.id);
    if (typeof taken === "string") throw new Error(`taken: ${taken}`);
    // What a merge does: the notice and its reports name the break that stays.
    await database.db
      .update(reportNotice)
      .set({ breakId: "other" })
      .where(eq(reportNotice.breakId, "point"));
    await database.db
      .update(surfReport)
      .set({ breakId: "other" })
      .where(eq(surfReport.breakId, "point"));
    await database.db.insert(stationListBreak).values({ listId: "favorites", breakId: "other" });
    expect(await handNoticePush(database.db, out, storage, notice!.id, taken)).toBe("skipped");
    expect(await run()).toMatchObject({ sent: 1 });
    expect(service.sent()[0]?.push).toMatchObject({
      title: "New report at Other",
      tag: "report-other",
    });
  });

  it("does not push a report that was hidden or deleted meanwhile", async () => {
    await database.db.insert(alertSettings).values({
      userId: "keeper",
      quietFrom: 0,
      quietTo: 23 * 60 + 59,
    });
    await device("keeper");
    await shown("first");
    await run();
    await database.db.update(surfReport).set({ state: "hidden" }).where(eq(surfReport.id, "first"));
    await database.db
      .update(alertSettings)
      .set({ quietFrom: null, quietTo: null })
      .where(eq(alertSettings.userId, "keeper"));
    await database.db
      .update(reportNotice)
      .set({ dueAt: new Date() })
      .where(eq(reportNotice.userId, "keeper"));
    expect(await run()).toMatchObject({ sent: 0, expired: 1 });
    expect(service.sent()).toHaveLength(0);
  });

  it("tells no account that blocked the author, and pushes a notice from the reports of others alone", async () => {
    // Decision 071: the keeper blocked the author, and is told nothing of what it sends.
    await database.db
      .insert(accountBlock)
      .values({ blockerId: "keeper", blockedId: "author", username: "author" });
    await shown("first");
    await run();
    expect((await notices()).map((one) => one.userId)).toEqual(["member", "spotter"]);
    await database.db.delete(accountBlock);
    await database.db.delete(reportNotice);

    // A notice that waits for the end of the quiet hours holds a report of the spotter's and,
    // later, one of the author's, whom the keeper blocks before the push leaves.
    await database.db.insert(alertSettings).values({
      userId: "keeper",
      quietFrom: 0,
      quietTo: 23 * 60 + 59,
    });
    await device("keeper");
    await shown("spotted", { by: "spotter", ago: 20 * 60 * 1000 });
    await shown("authored", { by: "author" });
    await run();
    const [kept] = (await notices()).filter((one) => one.userId === "keeper");
    expect((await membersOf(kept!.id)).toSorted()).toEqual(["authored", "spotted"]);
    await database.db
      .insert(accountBlock)
      .values({ blockerId: "keeper", blockedId: "author", username: "author" });
    await database.db
      .update(alertSettings)
      .set({ quietFrom: null, quietTo: null })
      .where(eq(alertSettings.userId, "keeper"));
    await database.db
      .update(reportNotice)
      .set({ dueAt: new Date() })
      .where(eq(reportNotice.id, kept!.id));

    expect(await run()).toMatchObject({ sent: 1 });
    const [sent] = service.sent();
    expect(sent?.push).toMatchObject({
      title: "New report at La Point",
      body: "spotter · Shoulder · “Clean sets on the outside”",
    });
    expect(sent?.push.image).toContain("m/spotted/0/thumb.webp");
  });

  it("does not push to an account that left the list meanwhile, or switched reports off", async () => {
    await device("keeper");
    await device("member");
    await database.db.insert(alertSettings).values({
      userId: "keeper",
      quietFrom: 0,
      quietTo: 23 * 60 + 59,
    });
    await database.db.insert(alertSettings).values({
      userId: "member",
      quietFrom: 0,
      quietTo: 23 * 60 + 59,
    });
    await shown("first");
    await run();
    await database.db.delete(stationListBreak).where(eq(stationListBreak.listId, "favorites"));
    await database.db
      .update(alertSettings)
      .set({ onReports: false, quietFrom: null, quietTo: null })
      .where(eq(alertSettings.userId, "member"));
    await database.db
      .update(alertSettings)
      .set({ quietFrom: null, quietTo: null })
      .where(eq(alertSettings.userId, "keeper"));
    await database.db.update(reportNotice).set({ dueAt: new Date() });
    expect(await run()).toMatchObject({ sent: 0, expired: 2 });
  });

  it("holds the pushes of a day past six", async () => {
    await device("keeper");
    const breaks = Array.from(
      { length: ACCOUNT_DAILY_REPORT_PUSHES + 1 },
      (_, index) => `b${index}`,
    );
    await database.db
      .insert(surfBreak)
      .values(breaks.map((id) => ({ id, slug: id, name: id, latitude: 43, longitude: -1 })));
    await database.db
      .insert(stationListBreak)
      .values(breaks.map((breakId) => ({ listId: "favorites", breakId })));
    for (const breakId of breaks) await shown(`at-${breakId}`, { breakId });
    expect(await run()).toMatchObject({ sent: ACCOUNT_DAILY_REPORT_PUSHES, held: 1 });
    // The list still has the seventh.
    const keeper = (await notices()).filter((one) => one.userId === "keeper");
    expect(keeper).toHaveLength(ACCOUNT_DAILY_REPORT_PUSHES + 1);
  });

  it("forgets a browser whose push service says it is gone", async () => {
    await device("keeper");
    const [subscribed] = await database.db.select().from(pushSubscription);
    service.answers.set(subscribed!.endpoint, 410);
    await shown("first");
    expect(await run()).toMatchObject({ sent: 0, expired: 1 });
    expect(await database.db.select().from(pushSubscription)).toHaveLength(0);
  });

  it("makes no push on an instance that sends none, and keeps the notice in the list", async () => {
    await device("keeper");
    await shown("first");
    await run(null);
    const [notice] = (await notices()).filter((one) => one.userId === "keeper");
    expect(notice).toMatchObject({ pushState: null });
  });

  it("forgets the notices of more than thirty days", async () => {
    await shown("first");
    await run();
    vi.setSystemTime(new Date(AT.getTime() + 31 * 24 * HOUR));
    expect(await run()).toMatchObject({ pruned: 3 });
    expect(
      await database.db
        .select()
        .from(reportNotice)
        .where(and(eq(reportNotice.userId, "keeper"))),
    ).toHaveLength(0);
  });
});
