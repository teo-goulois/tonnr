import { call } from "@orpc/server";
import type { Session } from "@repo/auth";
import { CONTACT_EMAIL } from "@repo/config/app";
import { visitorClosure } from "@repo/db/schema/access";
import { user } from "@repo/db/schema/auth";
import { providerCalls } from "@repo/db/schema/forecasts";
import { createTestDatabase, TEST_DATABASE_URL } from "@repo/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Context } from "./context";
import { IDEAS_A_DAY } from "./ideas";
import { v1Router } from "./routers/index";
import { testForecasts, testIdeas, testPlaces, testVerification } from "./testing";
import { createUsage, type Usage } from "./usage";

const WEB = "https://app.example.org";
const IDEA = {
  name: "Léa",
  email: "lea@example.org",
  idea: "A swell chart\nby the hour",
  locale: "fr",
};

// An idea sent from the landing, by mail to whoever makes the product: decision 026.
describe.skipIf(!TEST_DATABASE_URL)("an idea from the landing", () => {
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
    await database.db.delete(visitorClosure);
    await database.db.delete(user);
    await database.db.insert(user).values({ id: "ana", name: "Ana", email: "ana@example.org" });
  });

  type By = { session?: string; site?: string | null; ideas?: Context["ideas"] };
  const by = ({ session, site = WEB, ideas }: By) => {
    const context: Context = {
      db: database.db,
      session: session
        ? ({
            user: { id: session, name: session, email: `${session}@example.org` },
            session: { id: `s-${session}`, userId: session, token: `t-${session}` },
          } as Session)
        : null,
      authorization: null,
      site,
      adminSites: [],
      usage,
      forecasts,
      places: testPlaces().places,
      verification: testVerification(database.db, { on: false }).verification,
      ideas,
      reply: {},
      server: { startedAt: new Date("2026-10-14T08:00:00Z"), webOrigin: WEB },
    };
    return { context };
  };
  const send = (input: unknown, context: ReturnType<typeof by>) =>
    call(v1Router.ideas.send, input as never, context);

  it("sends a visitor's idea to whoever makes the product, to be answered to its sender", async () => {
    const out = testIdeas(database.db);

    expect(await send(IDEA, by({ ideas: out.ideas }))).toEqual({ sent: true });
    const [mail, ...more] = out.sent();
    expect(more).toEqual([]);
    expect(mail).toMatchObject({
      to: CONTACT_EMAIL,
      subject: "Feature from landing: Léa",
      replyTo: "lea@example.org",
    });
    expect(mail?.text).toContain("A swell chart\nby the hour");
    expect(mail?.text).toContain("in French");
  });

  it("sends an account's, and a visitor's while the instance is closed to visitors", async () => {
    const out = testIdeas(database.db);
    await database.db.insert(visitorClosure).values({ id: "instance" });

    expect(await send(IDEA, by({ session: "ana", ideas: out.ideas }))).toEqual({ sent: true });
    expect(await send(IDEA, by({ ideas: out.ideas }))).toEqual({ sent: true });
    expect(out.sent()).toHaveLength(2);
  });

  it("refuses a request that comes from no page of the web app", async () => {
    const out = testIdeas(database.db);

    for (const site of [null, "https://elsewhere.example"]) {
      await expect(send(IDEA, by({ site, ideas: out.ideas }))).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
    }
    expect(out.sent()).toEqual([]);
  });

  it("refuses an address that would say more than one, and a name of two lines", async () => {
    const out = testIdeas(database.db);

    for (const input of [
      { ...IDEA, email: "lea@example.org\r\nBcc: someone@example.org" },
      { ...IDEA, email: "Léa <lea@example.org>" },
      { ...IDEA, email: "lea@example.org, ben@example.org" },
      { ...IDEA, name: "Léa\r\nBcc: someone@example.org" },
      { ...IDEA, idea: "   " },
      { ...IDEA, idea: "a".repeat(4001) },
    ]) {
      await expect(send(input, by({ ideas: out.ideas }))).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    }
    expect(out.sent()).toEqual([]);
  });

  it("says why an idea did not leave", async () => {
    expect(await send(IDEA, by({}))).toEqual({ sent: false, why: "off" });
    expect(await send(IDEA, by({ ideas: testIdeas(database.db, { on: false }).ideas }))).toEqual({
      sent: false,
      why: "off",
    });
    expect(
      await send(IDEA, by({ ideas: testIdeas(database.db, { failing: true }).ideas })),
    ).toEqual({ sent: false, why: "failed" });
  });

  it(`sends ${IDEAS_A_DAY} a day, within the instance's mails`, async () => {
    const out = testIdeas(database.db);
    for (let sent = 0; sent < IDEAS_A_DAY; sent += 1) {
      expect(await send(IDEA, by({ ideas: out.ideas }))).toEqual({ sent: true });
    }
    expect(await send(IDEA, by({ ideas: out.ideas }))).toEqual({ sent: false, why: "full" });
    expect(out.sent()).toHaveLength(IDEAS_A_DAY);

    await database.db.delete(providerCalls);
    const few = testIdeas(database.db, { dailyLimit: 1 });
    expect(await send(IDEA, by({ ideas: few.ideas }))).toEqual({ sent: true });
    expect(await send(IDEA, by({ ideas: few.ideas }))).toEqual({ sent: false, why: "full" });
  });
});
