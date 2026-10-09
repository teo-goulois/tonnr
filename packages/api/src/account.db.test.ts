import { call, ORPCError } from "@orpc/server";
import type { Session } from "@repo/auth";
import { operator } from "@repo/db/schema/access";
import { user } from "@repo/db/schema/auth";
import { providerCalls } from "@repo/db/schema/forecasts";
import { createTestDatabase, TEST_DATABASE_URL } from "@repo/db/testing";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Context } from "./context";
import { v1Router } from "./routers/index";
import { testForecasts, testVerification } from "./testing";
import { createUsage, type Usage } from "./usage";

// An account and the mail that checks its address: decision 026. The mail is kept in memory.
describe.skipIf(!TEST_DATABASE_URL)("an account and its address", () => {
  const AT = new Date("2026-10-09T08:00:00Z");
  const ADMIN = "https://admin.example.org";
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let usage: Usage;
  const { forecasts } = testForecasts();

  beforeAll(async () => {
    database = await createTestDatabase();
    usage = createUsage(database.db, { every: null });
  });
  afterAll(() => database?.drop());
  beforeEach(async () => {
    await database.db.delete(providerCalls);
    await database.db.delete(user);
    await database.db.insert(user).values([
      { id: "ana", name: "Ana", email: "ana@example.org" },
      { id: "ben", name: "Ben", email: "ben@example.org" },
      { id: "checked", name: "Checked", email: "checked@example.org", emailVerified: true },
    ]);
  });

  type Mail = ReturnType<typeof testVerification>;
  const by = (id: string, mail: Mail, emailVerified = id === "checked") => {
    const context: Context = {
      db: database.db,
      session: {
        user: { id, name: id, email: `${id}@example.org`, emailVerified },
        session: { id: `s-${id}`, userId: id, token: `t-${id}`, expiresAt: new Date("2030-01-01") },
      } as Session,
      authorization: null,
      site: ADMIN,
      adminSites: [ADMIN],
      usage,
      forecasts,
      verification: mail.verification,
      reply: {},
      server: { startedAt: AT, webOrigin: "http://localhost:3001" },
    };
    return { context };
  };
  const ask = (id: string, mail: Mail, input: { locale?: "en" | "fr" } = {}) => {
    const calling = by(id, mail);
    return call(v1Router.account.sendVerification, input, calling).then(
      (answer) => ({ answer, reply: calling.context.reply }),
      (error: unknown) => {
        if (!(error instanceof ORPCError)) throw error;
        return { refused: error.code as string, reply: calling.context.reply };
      },
    );
  };

  it("says whether its address is checked, and whether the instance checks addresses", async () => {
    const mailing = testVerification(database.db);
    const silent = testVerification(database.db, { on: false });

    expect(await call(v1Router.account.get, undefined, by("ana", mailing))).toEqual({
      id: "ana",
      name: "ana",
      email: "ana@example.org",
      isOperator: false,
      emailVerified: false,
      checksAddresses: true,
    });
    expect(await call(v1Router.account.get, undefined, by("checked", silent))).toMatchObject({
      emailVerified: true,
      checksAddresses: false,
    });
  });

  it("is sent the mail again, in the language it names, with a link that ends on the web app", async () => {
    const mail = testVerification(database.db);

    expect(await ask("ana", mail, { locale: "fr" })).toMatchObject({ answer: { sent: true } });

    const [sent] = mail.sent();
    expect(mail.sent()).toHaveLength(1);
    expect(sent).toMatchObject({ to: "ana@example.org" });
    expect(sent?.subject).toContain("Vérifie ton adresse");
    const link = new URL(mail.link() ?? "");
    expect(`${link.origin}${link.pathname}`).toBe("http://localhost:3000/api/auth/verify-email");
    expect(link.searchParams.get("callbackURL")).toBe("http://localhost:3001/verified");
    expect(link.searchParams.get("token")).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);

    await ask("ben", mail);
    expect(mail.sent()[1]?.subject).toContain("Check your address");
  });

  it("gets no link to a page on an instance that has no web app", async () => {
    const alone = testVerification(database.db, {
      settings: { CORS_ORIGIN: "http://localhost:3000" },
    });

    await ask("ana", alone);
    expect(new URL(alone.link() ?? "").searchParams.has("callbackURL")).toBe(false);
  });

  it("is refused a mail for an address that is checked", async () => {
    const mail = testVerification(database.db);

    expect(await ask("checked", mail)).toMatchObject({ refused: "CONFLICT" });
    expect(mail.sent()).toEqual([]);
  });

  it("has three mails an hour, and is told how long to wait for the next", async () => {
    const mail = testVerification(database.db);

    for (let sent = 0; sent < 3; sent += 1) {
      expect(await ask("ana", mail)).toMatchObject({ answer: { sent: true } });
    }
    const fourth = await ask("ana", mail);
    expect(fourth).toMatchObject({ refused: "TOO_MANY_REQUESTS" });
    expect(fourth.reply.retryAfterSeconds).toBeGreaterThan(0);
    expect(fourth.reply.retryAfterSeconds).toBeLessThanOrEqual(3600);
    expect(mail.sent()).toHaveLength(3);

    // Another account has its own count.
    expect(await ask("ben", mail)).toMatchObject({ answer: { sent: true } });
  });

  it("has five mails a day, whatever the hour, and waits for the day to turn", async () => {
    const mail = testVerification(database.db);
    // The day and what is left of it, as the database counts them.
    await database.db.insert(providerCalls).values({
      provider: "mail:ana",
      bucket: "day",
      start: sql`date_trunc('day', now(), 'UTC')`,
      calls: 5,
    });
    const { rows } = await database.db.execute<{ left: number }>(sql`
      select extract(epoch from date_trunc('day', now(), 'UTC') + interval '1 day' - now())::float8 as left
    `);

    const refused = await ask("ana", mail);

    expect(refused).toMatchObject({ refused: "TOO_MANY_REQUESTS" });
    // Until the day turns, not the hour: to within the seconds this test took.
    expect(Math.abs((refused.reply.retryAfterSeconds ?? 0) - (rows[0]?.left ?? 0))).toBeLessThan(5);
    expect(mail.sent()).toEqual([]);

    // With the instance's day full too, the account is still told of its own wait.
    await database.db.insert(providerCalls).values({
      provider: "mail",
      bucket: "day",
      start: sql`date_trunc('day', now(), 'UTC')`,
      calls: 200,
    });
    expect(await ask("ana", mail)).toMatchObject({ refused: "TOO_MANY_REQUESTS" });
  });

  it("is told that no mail can be sent, by an instance that sends none, is at its day's limit, or whose provider fails", async () => {
    const said = vi.spyOn(console, "error").mockImplementation(() => {});

    const silent = testVerification(database.db, { on: false });
    expect(await ask("ana", silent)).toMatchObject({ refused: "SERVICE_UNAVAILABLE" });

    const small = testVerification(database.db, { dailyLimit: 1 });
    expect(await ask("ana", small)).toMatchObject({ answer: { sent: true } });
    const stopped = await ask("ben", small);
    expect(stopped).toMatchObject({ refused: "SERVICE_UNAVAILABLE" });
    // The instance's limit is not the account's to wait for, and did not spend its count.
    expect(stopped.reply.retryAfterSeconds).toBeUndefined();
    expect(small.sent()).toHaveLength(1);
    const kept = await database.db.select().from(providerCalls);
    expect(kept.filter((row) => row.provider === "mail:ben")).toEqual([]);

    await database.db.delete(providerCalls);
    const down = testVerification(database.db, { failing: true });
    expect(await ask("ana", down)).toMatchObject({ refused: "SERVICE_UNAVAILABLE" });
    // The mail that did not leave stays counted: it may have left all the same.
    const counted = await database.db.select().from(providerCalls);
    expect(counted.filter((row) => row.provider === "mail")).toMatchObject([{ calls: 1 }]);
    // And the log names no one.
    expect(said.mock.calls.flat().join(" ")).not.toContain("ana@example.org");
    said.mockRestore();
  });

  it("is not made of settings that cannot be right", () => {
    for (const dailyLimit of [0, -1, 1.5, Number.NaN]) {
      expect(() => testVerification(database.db, { dailyLimit }), String(dailyLimit)).toThrow(
        "EMAIL_DAILY_LIMIT",
      );
    }
  });

  it("shows on the instance's page through what the mail goes, and how many went today", async () => {
    await database.db.insert(operator).values({ userId: "ana" });
    const state = (mail: Mail) => call(v1Router.instance.state, undefined, by("ana", mail));

    const silent = testVerification(database.db, { on: false });
    expect((await state(silent)).mail).toEqual({ via: null, today: 0, dailyLimit: 200 });

    const mail = testVerification(database.db, { dailyLimit: 50 });
    await ask("ben", mail);
    await ask("ben", mail);
    expect((await state(mail)).mail).toEqual({ via: "unosend", today: 2, dailyLimit: 50 });
  });
});
