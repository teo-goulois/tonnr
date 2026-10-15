import { call, ORPCError } from "@orpc/server";
import type { Session } from "@repo/auth";
import { user } from "@repo/db/schema/auth";
import { surfBreak } from "@repo/db/schema/spots";
import { eq } from "drizzle-orm";
import { createTestDatabase, TEST_DATABASE_URL } from "@repo/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Context } from "./context";
import { readAuthorization } from "./keys";
import { v1Router } from "./routers/index";
import { testForecasts, testPlaces, testVerification } from "./testing";
import { createUsage, type Usage } from "./usage";

// A list is shared by a link, which whoever has it reads the list with: decision 035.
describe.skipIf(!TEST_DATABASE_URL)("a list shared by a link", () => {
  const WEB = "https://app.example.org";

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
    await db.delete(user);
    await db.delete(surfBreak);
    await db.insert(user).values([
      { id: "ana", name: "Ana", email: "ana@example.org" },
      { id: "ben", name: "Ben", email: "ben@example.org" },
      { id: "cleo", name: "Cleo", email: "cleo@example.org" },
    ]);
    await db
      .insert(surfBreak)
      .values({ id: "jetty", slug: "jetty", name: "North jetty", latitude: 48, longitude: -4.5 });
  });

  const context = (id: string | null, authorization: string | null = null): Context => ({
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
    authorization,
    site: WEB,
    adminSites: [],
    usage,
    forecasts,
    places: testPlaces().places,
    verification: testVerification(database.db, { on: false }).verification,
    reply: {},
    server: { startedAt: new Date("2026-10-11T08:00:00Z"), webOrigin: WEB },
  });
  const by = (id: string) => ({ context: context(id) });
  const anyone = {
    get context() {
      return context(null);
    },
  };
  const byLink = (link: string) => ({ context: context(null, `List ${link}`) });

  const code = async (attempt: Promise<unknown>) => {
    try {
      await attempt;
      return "answered";
    } catch (error) {
      return error instanceof ORPCError ? error.code : "threw";
    }
  };

  // Ana's list, with one of her spots and a break of the catalogue, shared.
  async function shared(password?: string) {
    const reef = await call(
      v1Router.spots.create,
      {
        name: "The reef",
        latitude: 48,
        longitude: -4.5,
        characteristics: { breakTypes: ["reef"] },
      },
      by("ana"),
    );
    const list = await call(v1Router.lists.create, { name: "Winter" }, by("ana"));
    await call(v1Router.lists.addSpot, { id: list.id, spotId: reef.id }, by("ana"));
    await call(v1Router.lists.addBreak, { id: list.id, breakId: "jetty" }, by("ana"));
    const made = await call(
      v1Router.lists.share,
      { id: list.id, ...(password ? { password } : {}) },
      by("ana"),
    );
    return { reef, list: made, token: made.share!.token };
  }

  it("is its owner's alone until they share it, and keeps its link when shared again", async () => {
    const list = await call(v1Router.lists.create, { name: "Winter" }, by("ana"));
    expect(list.share).toBeNull();

    const made = await call(v1Router.lists.share, { id: list.id }, by("ana"));
    expect(made.share).toEqual({
      token: expect.stringMatching(/^[A-Za-z0-9_-]{22}$/),
      hasPassword: false,
      members: 0,
    });
    const again = await call(v1Router.lists.share, { id: list.id, password: "swell" }, by("ana"));
    expect(again.share).toEqual({ ...made.share, hasPassword: true });
    // Left out, the password stays. Null asks none.
    expect((await call(v1Router.lists.share, { id: list.id }, by("ana"))).share?.hasPassword).toBe(
      true,
    );
    const open = await call(v1Router.lists.share, { id: list.id, password: null }, by("ana"));
    expect(open.share?.hasPassword).toBe(false);
    expect((await call(v1Router.lists.list, undefined, by("ana"))).lists[0]?.share).toEqual(
      open.share,
    );

    expect(await code(call(v1Router.lists.share, { id: list.id }, by("ben")))).toBe("NOT_FOUND");
  });

  it("opens for whoever has the link, with the owner's spots and no account", async () => {
    const { reef, list, token } = await shared();

    const opened = await call(v1Router.shared.open, { token }, anyone);
    expect(opened).toMatchObject({
      locked: false,
      pass: null,
      owner: null,
      list: { id: list.id, name: "Winter", access: "link", stationIds: [], breakIds: ["jetty"] },
    });
    if (opened.locked) throw new Error("locked");
    expect(opened.list.spots).toHaveLength(1);
    expect(opened.list.spots[0]).toMatchObject({
      id: reef.id,
      name: "The reef",
      latitude: 48,
      isOwner: false,
      alertIds: [],
      publication: null,
    });
    expect(opened.list.spots[0]?.characteristics.breakTypes).toEqual(["reef"]);

    expect(
      await code(call(v1Router.shared.open, { token: "nobody-made-this-link0" }, anyone)),
    ).toBe("NOT_FOUND");
    // The owner opens it as its owner.
    expect(await call(v1Router.shared.open, { token }, by("ana"))).toMatchObject({
      list: { access: "owner", spots: [{ isOwner: true }] },
    });

    // Whoever has the link reads who shares the list, by the username they chose.
    await database.db.update(user).set({ username: "ana" }).where(eq(user.id, "ana"));
    expect(await call(v1Router.shared.open, { token }, anyone)).toMatchObject({ owner: "ana" });
  });

  it("lets a link read what everyone shares, and nothing of an account", async () => {
    const { token } = await shared();

    expect(readAuthorization(`List ${token}`)).toEqual({
      via: "link",
      link: { token, pass: null },
    });
    const { breaks } = await call(v1Router.breaks.list, {}, byLink(token));
    expect(breaks.map((found) => found.id)).toEqual(["jetty"]);
    expect(await code(call(v1Router.lists.list, undefined, byLink(token)))).toBe("FORBIDDEN");
    expect(await code(call(v1Router.spots.list, undefined, byLink(token)))).toBe("FORBIDDEN");
    expect(await code(call(v1Router.breaks.list, {}, byLink("nobody-made-this-link0")))).toBe(
      "UNAUTHORIZED",
    );
  });

  it("asks for its password once, then takes what stands for it", async () => {
    const { token } = await shared("offshore");

    expect(await call(v1Router.shared.open, { token }, anyone)).toEqual({
      locked: true,
      owner: null,
    });
    // It says who shares it, and nothing of itself.
    await database.db.update(user).set({ username: "ana" }).where(eq(user.id, "ana"));
    expect(await call(v1Router.shared.open, { token }, anyone)).toEqual({
      locked: true,
      owner: "ana",
    });
    await database.db.update(user).set({ username: null }).where(eq(user.id, "ana"));
    expect(await code(call(v1Router.shared.open, { token, password: "onshore" }, anyone))).toBe(
      "FORBIDDEN",
    );
    const opened = await call(v1Router.shared.open, { token, password: "offshore" }, anyone);
    if (opened.locked) throw new Error("locked");
    expect(opened.pass).toMatch(/^[0-9a-f]{64}$/);

    // The link alone reads nothing, and neither does a pass that was not given.
    expect(await code(call(v1Router.breaks.list, {}, byLink(token)))).toBe("UNAUTHORIZED");
    expect(await code(call(v1Router.breaks.list, {}, byLink(`${token}.${"0".repeat(64)}`)))).toBe(
      "UNAUTHORIZED",
    );
    expect(await code(call(v1Router.breaks.list, {}, byLink(`${token}.${opened.pass}`)))).toBe(
      "answered",
    );
    // The pass opens the list for an account that read it before it signed in.
    expect(await call(v1Router.shared.open, { token }, by("cleo"))).toEqual({
      locked: true,
      owner: null,
    });
    expect(
      await call(v1Router.shared.open, { token, pass: opened.pass! }, by("cleo")),
    ).toMatchObject({ locked: false, list: { access: "link" } });
    // With its pass the link opens the list again, and keeps it for an account.
    expect(
      await call(v1Router.shared.open, { token }, byLink(`${token}.${opened.pass}`)),
    ).toMatchObject({ locked: false, list: { access: "link" } });
    expect(
      await code(call(v1Router.shared.join, { token, pass: "0".repeat(64) }, by("cleo"))),
    ).toBe("FORBIDDEN");
    expect(await code(call(v1Router.shared.join, { token, pass: opened.pass! }, by("cleo")))).toBe(
      "answered",
    );
  });

  it("closes for a quarter of an hour after ten wrong passwords, to the right one too", async () => {
    const { token } = await shared("offshore");
    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect(await code(call(v1Router.shared.open, { token, password: "guess" }, anyone))).toBe(
        "FORBIDDEN",
      );
    }
    expect(await code(call(v1Router.shared.open, { token, password: "offshore" }, anyone))).toBe(
      "TOO_MANY_REQUESTS",
    );
    // The owner is asked none, and a new password opens it again.
    expect(await code(call(v1Router.shared.open, { token }, by("ana")))).toBe("answered");
    const { lists } = await call(v1Router.lists.list, undefined, by("ana"));
    await call(v1Router.lists.share, { id: lists[0]!.id, password: "glassy" }, by("ana"));
    expect(await code(call(v1Router.shared.open, { token, password: "glassy" }, anyone))).toBe(
      "answered",
    );
  });

  it("counts tries that come at once one after the other, and lets none pass the ten", async () => {
    const { token } = await shared("offshore");
    for (let attempt = 0; attempt < 9; attempt += 1)
      await code(call(v1Router.shared.open, { token, password: "guess" }, anyone));

    const answers = await Promise.all(
      Array.from({ length: 20 }, () =>
        code(call(v1Router.shared.open, { token, password: "guess" }, anyone)),
      ),
    );
    expect(answers.filter((answer) => answer === "FORBIDDEN")).toHaveLength(1);
    expect(answers.filter((answer) => answer === "TOO_MANY_REQUESTS")).toHaveLength(19);
  });

  it("does not count the right password among the wrong ones", async () => {
    const { token } = await shared("offshore");
    for (let attempt = 0; attempt < 9; attempt += 1)
      await code(call(v1Router.shared.open, { token, password: "guess" }, anyone));
    for (let attempt = 0; attempt < 3; attempt += 1)
      expect(await code(call(v1Router.shared.open, { token, password: "offshore" }, anyone))).toBe(
        "answered",
      );
    expect(await code(call(v1Router.shared.open, { token, password: "guess" }, anyone))).toBe(
      "FORBIDDEN",
    );
    expect(await code(call(v1Router.shared.open, { token, password: "offshore" }, anyone))).toBe(
      "TOO_MANY_REQUESTS",
    );
  });

  it("is kept by an account that has the link, which then reads it without", async () => {
    const { list, token } = await shared("offshore");

    expect(await code(call(v1Router.lists.view, { id: list.id }, by("ben")))).toBe("NOT_FOUND");
    expect(await code(call(v1Router.shared.join, { token }, by("ben")))).toBe("FORBIDDEN");
    expect(await call(v1Router.shared.join, { token, password: "offshore" }, by("ben"))).toEqual({
      id: list.id,
    });
    // Keeping it again, and keeping one's own, change nothing.
    await call(v1Router.shared.join, { token, password: "offshore" }, by("ben"));
    await call(v1Router.shared.join, { token, password: "offshore" }, by("ana"));

    const view = await call(v1Router.lists.view, { id: list.id }, by("ben"));
    expect(view).toMatchObject({ access: "member", name: "Winter", breakIds: ["jetty"] });
    expect(view.spots[0]).toMatchObject({ name: "The reef", isOwner: false });
    // A member is asked no password by the link either.
    expect(await call(v1Router.shared.open, { token }, by("ben"))).toMatchObject({
      locked: false,
      list: { access: "member" },
    });

    const bens = await call(v1Router.lists.list, undefined, by("ben"));
    expect(bens.lists).toEqual([]);
    expect(bens.joined).toEqual([{ id: list.id, name: "Winter", isDefault: false, size: 2 }]);
    const anas = await call(v1Router.lists.list, undefined, by("ana"));
    expect(anas.joined).toEqual([]);
    expect(anas.lists[0]?.share?.members).toBe(1);
    // A member reads, and changes nothing.
    expect(
      await code(call(v1Router.lists.addBreak, { id: list.id, breakId: "jetty" }, by("ben"))),
    ).toBe("NOT_FOUND");
    expect(await code(call(v1Router.lists.share, { id: list.id }, by("ben")))).toBe("NOT_FOUND");

    await call(v1Router.lists.leave, { id: list.id }, by("ben"));
    expect(await code(call(v1Router.lists.view, { id: list.id }, by("ben")))).toBe("NOT_FOUND");
  });

  it("ends a link with a new one, and keeps who kept the list", async () => {
    const { list, token } = await shared();
    await call(v1Router.shared.join, { token }, by("ben"));

    const renewed = await call(v1Router.lists.renewShare, { id: list.id }, by("ana"));
    expect(renewed.share?.token).not.toBe(token);
    expect(renewed.share?.members).toBe(1);
    expect(await code(call(v1Router.shared.open, { token }, anyone))).toBe("NOT_FOUND");
    expect(await code(call(v1Router.breaks.list, {}, byLink(token)))).toBe("UNAUTHORIZED");
    expect(await code(call(v1Router.shared.open, { token: renewed.share!.token }, anyone))).toBe(
      "answered",
    );
    expect(await code(call(v1Router.lists.view, { id: list.id }, by("ben")))).toBe("answered");
  });

  it("stops for everyone when its owner stops sharing it", async () => {
    const { list, token } = await shared();
    await call(v1Router.shared.join, { token }, by("ben"));

    const stopped = await call(v1Router.lists.unshare, { id: list.id }, by("ana"));
    expect(stopped.share).toBeNull();
    expect(await code(call(v1Router.shared.open, { token }, anyone))).toBe("NOT_FOUND");
    expect(await code(call(v1Router.lists.view, { id: list.id }, by("ben")))).toBe("NOT_FOUND");
    expect((await call(v1Router.lists.list, undefined, by("ben"))).joined).toEqual([]);
    // Shared again, it has another link and nobody keeps it.
    const again = await call(v1Router.lists.share, { id: list.id }, by("ana"));
    expect(again.share).toMatchObject({ members: 0 });
    expect(again.share?.token).not.toBe(token);
    expect(await code(call(v1Router.lists.renewShare, { id: "favorites" }, by("ana")))).toBe(
      "NOT_FOUND",
    );
  });
});
