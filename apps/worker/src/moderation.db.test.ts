import { CONTACT_EMAIL } from "@repo/config/app";
import { REPORT_TERMS } from "@repo/config/media";
import { operator } from "@repo/db/schema/access";
import { alertSettings } from "@repo/db/schema/alerts";
import { user } from "@repo/db/schema/auth";
import { breakContribution, contributionVerdict } from "@repo/db/schema/community";
import { providerCalls } from "@repo/db/schema/forecasts";
import { surfReport, surfReportFlag } from "@repo/db/schema/reports";
import { surfBreak } from "@repo/db/schema/spots";
import { createTestDatabase, TEST_DATABASE_URL } from "@repo/db/testing";
import { MAIL_PROVIDER, type Mailer } from "@repo/mail";
import { testMailer } from "@repo/mail/testing";
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { MODERATION_MAIL_PROVIDER, type ModerationOut, runModeration } from "./moderation";

const ADMIN = "https://admin.example.org";

// What accounts flagged and contested, mailed to the instance's operators: decision 067.
describe.skipIf(!TEST_DATABASE_URL)("the mail of what accounts flagged", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let mail: ReturnType<typeof testMailer>;
  let out: ModerationOut;

  beforeAll(async () => {
    database = await createTestDatabase();
  });
  afterAll(() => database?.drop());
  beforeEach(async () => {
    mail = testMailer();
    out = { mailer: mail.mailer, adminOrigin: ADMIN };
    const { db } = database;
    await db.delete(breakContribution);
    await db.delete(user);
    await db.delete(surfBreak);
    // The hour's mail is counted by the database's own hour.
    await db.delete(providerCalls);
    await db.insert(user).values(
      ["author", "flagger", "fresh", "keeper", "boss"].map((id) => ({
        id,
        name: id,
        email: `${id}@example.org`,
        username: id === "fresh" ? null : `${id}_name`,
      })),
    );
    await db
      .insert(surfBreak)
      .values({ id: "point", slug: "point", name: "The point", latitude: 43.48, longitude: -1.56 });
    await db.insert(surfReport).values({
      id: "report",
      userId: "author",
      breakId: "point",
      state: "published",
      note: "Clean sets",
      terms: REPORT_TERMS,
    });
    await db.insert(breakContribution).values({
      id: "line",
      breakId: "point",
      breakRef: "point",
      userId: "author",
      line: "access",
      value: "Park by the church",
      language: "en",
      status: "shown",
      license: "DbCL-1.0",
    });
  });

  const flag = (userId: string, counts = true) =>
    database.db
      .insert(surfReportFlag)
      .values({ reportId: "report", userId, reason: "offensive", counts });
  const contest = (userId: string) =>
    database.db
      .insert(contributionVerdict)
      .values({ contributionId: "line", userId, verdict: "contest", reason: "No church there" });

  it("mails nothing when nothing is new, and counts no mail", async () => {
    // A confirmation is no contest.
    await database.db
      .insert(contributionVerdict)
      .values({ contributionId: "line", userId: "keeper", verdict: "confirm" });

    expect(await runModeration(database.db, out)).toEqual({
      flags: 0,
      contests: 0,
      mailed: 0,
      held: 0,
      failed: 0,
    });
    expect(mail.sent()).toEqual([]);
    expect(await database.db.select().from(providerCalls)).toEqual([]);
  });

  it("names each flag and contest once, says whether a flag counts, and names no account that flagged", async () => {
    await flag("flagger");
    await flag("fresh", false);
    await contest("keeper");

    expect(await runModeration(database.db, out)).toMatchObject({
      flags: 2,
      contests: 1,
      mailed: 1,
    });
    // No operator has a checked address: the instance's address reads it.
    const [sent] = mail.sent();
    expect(sent?.to).toBe(CONTACT_EMAIL);
    expect(sent?.text).toContain("The point");
    expect(sent?.text).toContain("Offensive · counts toward hiding it");
    expect(sent?.text).toContain("Offensive · hides nothing");
    expect(sent?.text).toContain("Still shown.");
    expect(sent?.text).toContain("“Park by the church”");
    expect(sent?.text).toContain("Contested: “No church there”");
    expect(sent?.text).toContain(`${ADMIN}/moderation?kind=reports&state=flagged`);
    expect(sent?.text).toContain(`${ADMIN}/moderation?kind=guides&queue=contested`);
    for (const who of ["flagger", "fresh", "keeper"]) {
      expect(sent?.text).not.toContain(who);
      expect(sent?.html).not.toContain(who);
    }

    // What it named is told, and is not named again.
    const flags = await database.db.select({ toldAt: surfReportFlag.toldAt }).from(surfReportFlag);
    expect(flags.every((one) => one.toldAt !== null)).toBe(true);
    const [contested] = await database.db
      .select({ toldAt: contributionVerdict.toldAt })
      .from(contributionVerdict);
    expect(contested?.toldAt).not.toBeNull();
    await database.db.delete(providerCalls);
    expect(await runModeration(database.db, out)).toMatchObject({ mailed: 0, held: 0 });
    expect(mail.sent()).toHaveLength(1);
  });

  it("sends one mail in an hour, and names then what came meanwhile", async () => {
    await flag("flagger");
    expect(await runModeration(database.db, out)).toMatchObject({ mailed: 1 });
    await contest("keeper");

    expect(await runModeration(database.db, out)).toMatchObject({ contests: 1, held: 1 });
    expect(mail.sent()).toHaveLength(1);
    const [waiting] = await database.db
      .select({ toldAt: contributionVerdict.toldAt })
      .from(contributionVerdict);
    expect(waiting?.toldAt).toBeNull();

    // The hour turns.
    await database.db
      .delete(providerCalls)
      .where(eq(providerCalls.provider, MODERATION_MAIL_PROVIDER));
    expect(await runModeration(database.db, out)).toMatchObject({
      flags: 0,
      contests: 1,
      mailed: 1,
    });
    expect(mail.sent()[1]?.text).not.toContain("Reports of the waves");
    expect(mail.sent()[1]?.text).toContain("No church there");
  });

  it("leaves when the instance's mails of the day are spent, and spends none of them", async () => {
    // Made-up sign-ups spent the day's mails.
    await database.db.insert(providerCalls).values({
      provider: MAIL_PROVIDER,
      bucket: "day",
      start: sql`date_trunc('day', now(), 'UTC')`,
      calls: 200,
    });
    await flag("flagger");

    expect(await runModeration(database.db, out)).toMatchObject({ flags: 1, mailed: 1 });
    expect(mail.sent()).toHaveLength(1);
    const counted = await database.db
      .select({ provider: providerCalls.provider, calls: providerCalls.calls })
      .from(providerCalls)
      .orderBy(providerCalls.provider);
    expect(counted).toEqual([
      { provider: MAIL_PROVIDER, calls: 200 },
      { provider: MODERATION_MAIL_PROVIDER, calls: 1 },
    ]);
  });

  it("marks nothing told when its mail was not taken", async () => {
    const failing = testMailer({ failing: true });
    await flag("flagger");

    expect(await runModeration(database.db, { ...out, mailer: failing.mailer })).toMatchObject({
      flags: 1,
      failed: 1,
      mailed: 0,
    });
    const [kept] = await database.db.select({ toldAt: surfReportFlag.toldAt }).from(surfReportFlag);
    expect(kept?.toldAt).toBeNull();
  });

  it("mails each operator at their checked address in their language, and marks told once one mail was taken", async () => {
    const { db } = database;
    // Two operators with a checked address, the second without a language, and one without.
    await db
      .update(user)
      .set({ emailVerified: true })
      .where(inArray(user.id, ["boss", "keeper"]));
    await db
      .insert(operator)
      .values([{ userId: "boss" }, { userId: "keeper" }, { userId: "author" }]);
    await db.insert(alertSettings).values([
      { userId: "boss", locale: "fr" },
      { userId: "author", locale: "es" },
    ]);
    await flag("flagger");
    // The provider takes the mail of one and not of the other.
    const refusing: Mailer = {
      via: "unosend",
      send: async (one) =>
        one.to === "keeper@example.org" ? "failed" : await mail.mailer.send(one),
    };

    expect(await runModeration(db, { ...out, mailer: refusing })).toMatchObject({
      flags: 1,
      mailed: 1,
      failed: 1,
    });
    expect(mail.sent().map((one) => [one.to, one.subject])).toEqual([
      ["boss@example.org", "À modérer sur Tonnr"],
    ]);
    // Told all the same: the operator whose mail was not taken reads it in the admin.
    const [told] = await db.select({ toldAt: surfReportFlag.toldAt }).from(surfReportFlag);
    expect(told?.toldAt).not.toBeNull();

    // Both mails taken, each in its reader's language.
    await db.delete(providerCalls);
    await contest("keeper");
    expect(await runModeration(db, out)).toMatchObject({ contests: 1, mailed: 2, failed: 0 });
    expect(
      mail
        .sent()
        .slice(1)
        .map((one) => [one.to, one.subject]),
    ).toEqual([
      ["boss@example.org", "À modérer sur Tonnr"],
      ["keeper@example.org", "To moderate on Tonnr"],
    ]);
  });

  it("mails the instance's address while no operator has a checked address, in the language of the first operator who chose one, and links nowhere without an admin app", async () => {
    await database.db.insert(operator).values({ userId: "boss" });
    await database.db.insert(alertSettings).values({ userId: "boss", locale: "fr" });
    await flag("flagger");

    await runModeration(database.db, { ...out, adminOrigin: null });
    const [sent] = mail.sent();
    expect(sent?.to).toBe(CONTACT_EMAIL);
    expect(sent?.subject).toBe("À modérer sur Tonnr");
    expect(sent?.text).toContain("Choquant · compte pour le masquer");
    expect(sent?.html).not.toContain("href=");
  });
});
