import { providerCalls } from "@repo/db/schema/forecasts";
import { createTestDatabase, TEST_DATABASE_URL } from "@repo/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Context } from "./context";
import { admitForecastQuestion, forecastQuestionCount } from "./forecast-callers";
import type { Caller } from "./index";

describe("what a caller may ask of the forecasts in an hour", () => {
  it("is counted for an account, a link and a visitor by their address, and not for a key", () => {
    const counts = {
      session: forecastQuestionCount({ via: "session", userId: "ana" }),
      link: forecastQuestionCount({ via: "link", listId: "list" }),
      visitor: forecastQuestionCount({ via: "visitor", address: "203.0.113.9" }),
      unknown: forecastQuestionCount({ via: "visitor" }),
      key: forecastQuestionCount({ via: "key", keyId: "key" }),
    };
    expect(counts.session).toMatchObject({ bucket: "hour:session:ana", span: "hour", limit: 600 });
    expect(counts.link).toMatchObject({ bucket: "hour:link:list", limit: 300 });
    // The address is not written: a hash of it tells one from another.
    expect(counts.visitor).toMatchObject({
      bucket: expect.stringMatching(/^hour:visitor:[0-9a-f]{16}$/),
      limit: 300,
    });
    expect(counts.visitor?.bucket).not.toContain("203.0.113.9");
    expect(counts.unknown).toMatchObject({ bucket: "hour:visitor:unknown" });
    expect(counts.key).toBeNull();
  });
});

describe.skipIf(!TEST_DATABASE_URL)("the questions of a caller's hour", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;

  beforeAll(async () => {
    database = await createTestDatabase();
  });
  afterAll(() => database?.drop());
  beforeEach(async () => {
    await database.db.delete(providerCalls);
  });

  const two = { session: 2, visitor: 2, link: 2 };
  const asked = async (caller: Caller | null, address?: string, session?: Context["session"]) => {
    const context = {
      db: database.db,
      reply: {} as Context["reply"],
      session: session ?? null,
      ...(caller ? { caller } : {}),
      address: address ?? null,
    };
    const outcome = await admitForecastQuestion(context, two).then(
      () => "admitted",
      (error: { code?: string }) => error.code,
    );
    return { outcome, retryAfterSeconds: context.reply.retryAfterSeconds };
  };

  it("are admitted to the limit, then refused until the hour turns", async () => {
    const ana: Caller = { via: "session", userId: "ana" };
    expect((await asked(ana)).outcome).toBe("admitted");
    expect((await asked(ana)).outcome).toBe("admitted");
    const refused = await asked(ana);
    expect(refused.outcome).toBe("TOO_MANY_REQUESTS");
    expect(refused.retryAfterSeconds).toBeGreaterThan(0);
    expect(refused.retryAfterSeconds).toBeLessThanOrEqual(3600);
    // Another account has its own hour.
    expect((await asked({ via: "session", userId: "bob" })).outcome).toBe("admitted");
  });

  it("count a visitor by the address they come from", async () => {
    const visitor: Caller = { via: "visitor" };
    await asked(visitor, "203.0.113.9");
    await asked(visitor, "203.0.113.9");
    expect((await asked(visitor, "203.0.113.9")).outcome).toBe("TOO_MANY_REQUESTS");
    expect((await asked(visitor, "198.51.100.2")).outcome).toBe("admitted");
  });

  it("never count a key, which is held to its developer account's limit", async () => {
    const key: Caller = { via: "key", keyId: "key" };
    for (let question = 0; question < 5; question += 1) {
      expect((await asked(key)).outcome).toBe("admitted");
    }
    expect(await database.db.$count(providerCalls)).toBe(0);
  });

  it("take the session of what is an account's own as the caller", async () => {
    const session = { user: { id: "ana" } } as NonNullable<Context["session"]>;
    await asked(null, undefined, session);
    await asked(null, undefined, session);
    expect((await asked(null, undefined, session)).outcome).toBe("TOO_MANY_REQUESTS");
    expect((await asked(null)).outcome).toBe("UNAUTHORIZED");
  });
});
