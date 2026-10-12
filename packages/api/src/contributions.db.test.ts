import { call, ORPCError } from "@orpc/server";
import type { Session } from "@repo/auth";
import { operator, operatorAction } from "@repo/db/schema/access";
import { user } from "@repo/db/schema/auth";
import { breakContribution, rankAward } from "@repo/db/schema/community";
import { surfBreak } from "@repo/db/schema/spots";
import { creditPublications } from "@repo/db/credits";
import { createTestDatabase, TEST_DATABASE_URL } from "@repo/db/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PROPOSALS_A_DAY, WAITING_MOST } from "./community";
import type { Context } from "./context";
import { v1Router } from "./routers/index";
import { testForecasts, testPlaces, testVerification } from "./testing";
import { createUsage, type Usage } from "./usage";

// What accounts write of a break, and what becomes of it: decision 041.
describe.skipIf(!TEST_DATABASE_URL)("the guide of a break", () => {
  const WEB = "https://app.example.org";
  const ADMIN = "https://admin.example.org";
  // Two invented breaks. The list the first came from says its bottom.
  const REEF = "0b6f7a52-4d1c-4f0e-9a3e-1c2d3e4f5a61";
  const BAY = "0b6f7a52-4d1c-4f0e-9a3e-1c2d3e4f5a62";

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
    await db.delete(operatorAction);
    await db.delete(breakContribution);
    await db.delete(user);
    await db.delete(surfBreak);
    await db.insert(user).values([
      ...["ana", "ben", "cleo", "dan"].map((id) => ({
        id,
        name: id,
        username: id,
        email: `${id}@example.org`,
        emailVerified: true,
      })),
      // An account made before usernames, which has chosen none.
      { id: "old", name: "Old Account", email: "old@example.org" },
      { id: "owner", name: "Owner", email: "owner@example.org" },
    ]);
    await db.insert(operator).values({ userId: "owner" });
    await db.insert(surfBreak).values([
      { id: REEF, name: "The reef", latitude: 48, longitude: -4.5, bottomTypes: ["sand"] },
      { id: BAY, name: "The bay", latitude: 48.1, longitude: -4.6 },
    ]);
  });

  const context = (id: string, site: string, checks = false): Context => ({
    db: database.db,
    session: {
      user: { id, name: id, email: `${id}@example.org`, emailVerified: false },
      session: { id: `s-${id}`, userId: id, token: `t-${id}`, expiresAt: new Date("2030-01-01") },
    } as Session,
    authorization: null,
    site,
    adminSites: [ADMIN],
    usage,
    forecasts,
    places: testPlaces().places,
    verification: testVerification(database.db, { on: checks }).verification,
    reply: {},
    server: { startedAt: new Date("2026-10-11T08:00:00Z"), webOrigin: WEB },
  });
  const by = (id: string) => ({ context: context(id, WEB) });
  const asOperator = () => ({ context: context("owner", ADMIN) });

  const code = async (attempt: Promise<unknown>) => {
    try {
      await attempt;
      return "answered";
    } catch (error) {
      return error instanceof ORPCError ? error.code : "threw";
    }
  };

  // A line as a test names it: the API is what says whether it is one.
  type Line = string;
  const propose = (
    id: string,
    line: Line,
    value: string[] | string,
    more: { breakId?: string; language?: "en" | "fr" } = {},
  ) =>
    call(
      v1Router.contributions.propose,
      { breakId: REEF, line: line as "access", value, agreed: true, ...more },
      by(id),
    );
  const accept = (id: string) => call(v1Router.reviews.accept, { id }, asOperator());
  const refuse = (id: string, reason = "Not so.") =>
    call(v1Router.reviews.refuse, { id, reason }, asOperator());
  const queue = async (name: "pending" | "contested" | "shown" | "confirmed" | "refused") =>
    (await call(v1Router.reviews.list, { queue: name }, asOperator())).reviews;
  const guide = (language: "en" | "fr" = "en", breakId = REEF) =>
    call(v1Router.guides.get, { breakId, language }, by("dan"));
  const lineOf = async (line: string, language: "en" | "fr" = "en") => {
    const found = (await guide(language)).lines.find((one) => one.line === line);
    if (!found) throw new Error(`The guide has no line "${line}".`);
    return found;
  };
  const mine = (id: string) => call(v1Router.contributions.mine, undefined, by(id));
  const keep = (id: string, breakId = REEF) =>
    call(v1Router.lists.addBreak, { id: "favorites", breakId }, by(id));
  /** An account that an operator read three times: its lists of words show at once. */
  async function trust(id: string) {
    for (const [line, value] of [
      ["access", "Park by the church and walk down."],
      ["entry", "Paddle out by the channel on the left."],
      ["hazards", "Rocks at low tide."],
    ] as const) {
      // Each account in its own words: the guide takes nothing it already says.
      const text = `${value} Signed, ${id}.`;
      await accept((await propose(id, line, text, { breakId: BAY, language: "en" })).id);
    }
  }

  describe("a contribution", () => {
    it("waits for an operator, and shows nothing until it is read", async () => {
      const written = await propose("ana", "bestTides", ["high", "mid"]);

      // The words are kept in the order of their vocabulary.
      expect(written).toMatchObject({
        break: { id: REEF, name: "The reef" },
        line: "bestTides",
        value: ["mid", "high"],
        language: null,
        status: "pending",
      });
      expect(await lineOf("bestTides")).toMatchObject({ value: null, origin: null, proposed: [] });
      expect(
        (await call(v1Router.guides.mine, { breakId: REEF }, by("ana"))).waiting,
      ).toMatchObject([{ id: written.id, line: "bestTides", status: "pending" }]);
      expect(await queue("pending")).toMatchObject([
        {
          id: written.id,
          value: ["mid", "high"],
          current: null,
          break: { id: REEF },
          author: { id: "ana", username: "ana", confirmed: 0 },
        },
      ]);
    });

    it("takes an account that has a username, and no other", async () => {
      expect(await code(propose("old", "bestTides", ["high"]))).toBe("FORBIDDEN");
      expect(await database.db.select().from(breakContribution)).toEqual([]);
    });

    it("is refused when it is no value of its line", async () => {
      for (const [line, value, more] of [
        ["bestTides", [], {}],
        ["bestTides", ["high", "sand"], {}],
        ["bestTides", "At high tide.", {}],
        ["access", ["high"], { language: "en" }],
        ["access", "ab", { language: "en" }],
        ["access", "a".repeat(501), { language: "en" }],
        // A text says the language it is written in.
        ["access", "Park by the church.", {}],
      ] as const) {
        expect(await code(propose("ana", line, value as string, more)), `${line}`).toBe(
          "BAD_REQUEST",
        );
      }
      expect(
        await code(propose("ana", "bestTides", ["high"], { breakId: crypto.randomUUID() })),
      ).toBe("NOT_FOUND");
      expect(await database.db.select().from(breakContribution)).toEqual([]);
    });

    it("is refused when the guide already says so, from the list or from another", async () => {
      expect(await code(propose("ana", "bottomTypes", ["sand"]))).toBe("CONFLICT");

      await accept((await propose("ana", "bottomTypes", ["sand", "rock"])).id);
      expect(await code(propose("ben", "bottomTypes", ["rock", "sand"]))).toBe("CONFLICT");
      // What the list said is no longer what the guide says.
      expect(await code(propose("ben", "bottomTypes", ["sand"]))).toBe("answered");
    });

    it("is refused when it says what the list says in another order", async () => {
      // The catalogue keeps a list as the list it came from gave it.
      await database.db
        .update(surfBreak)
        .set({ bottomTypes: ["rock", "sand"] })
        .where(eq(surfBreak.id, BAY));

      expect(await code(propose("ana", "bottomTypes", ["sand", "rock"], { breakId: BAY }))).toBe(
        "CONFLICT",
      );
      expect(await code(propose("ana", "bottomTypes", ["sand"], { breakId: BAY }))).toBe(
        "answered",
      );
    });

    it("gives way to the next one its author writes of the same line: the row stays", async () => {
      const first = await propose("ana", "bestTides", ["high"]);
      const second = await propose("ana", "bestTides", ["low"]);

      const rows = await database.db.select().from(breakContribution);
      expect(Object.fromEntries(rows.map((row) => [row.id, [row.status, row.value]]))).toEqual({
        [first.id]: ["withdrawn", ["high"]],
        [second.id]: ["pending", ["low"]],
      });
      expect((await queue("pending")).map((one) => one.id)).toEqual([second.id]);
      // An operator does not confirm what its author took back.
      expect(await code(accept(first.id))).toBe("CONFLICT");
    });

    it("is taken back by its author while it waits, and by no one else", async () => {
      const written = await propose("ana", "bestTides", ["high"]);

      expect(await code(call(v1Router.contributions.withdraw, { id: written.id }, by("ben")))).toBe(
        "NOT_FOUND",
      );
      expect(await call(v1Router.contributions.withdraw, { id: written.id }, by("ana"))).toEqual({
        withdrawn: true,
      });
      expect((await mine("ana")).contributions).toEqual([]);
      expect(await queue("pending")).toEqual([]);

      const kept = await propose("ana", "bestTides", ["low"]);
      await accept(kept.id);
      expect(await code(call(v1Router.contributions.withdraw, { id: kept.id }, by("ana")))).toBe(
        "NOT_FOUND",
      );
    });

    it("is held to what an account may have waiting, and may write in a day", async () => {
      const row = (index: number, status: "pending" | "withdrawn") => ({
        id: `made-${status}-${index}`,
        breakId: index % 2 ? REEF : BAY,
        breakRef: index % 2 ? REEF : BAY,
        userId: "ana",
        line: "access" as const,
        value: `Invented, number ${index}.`,
        language: "en" as const,
        license: "DbCL-1.0" as const,
        status,
      });
      // The index of the database lets an account one waiting row for a line of a break:
      // these wait on lines that do not exist twice, which only a test writes.
      const lines = ["access", "entry", "hazards", "rules"] as const;
      const waiting = Array.from({ length: WAITING_MOST }, (_, index) => ({
        ...row(index, "pending"),
        breakId: null,
        line: lines[index % lines.length] ?? "access",
      }));
      await database.db.insert(breakContribution).values(waiting);
      expect(await code(propose("ana", "bestTides", ["high"]))).toBe("FORBIDDEN");

      await database.db.delete(breakContribution);
      await database.db
        .insert(breakContribution)
        .values(Array.from({ length: PROPOSALS_A_DAY }, (_, index) => row(index, "withdrawn")));
      expect(await code(propose("ana", "bestTides", ["high"]))).toBe("TOO_MANY_REQUESTS");
      // Another account is held to its own.
      expect(await code(propose("ben", "bestTides", ["high"]))).toBe("answered");
    });
  });

  describe("what an operator answers", () => {
    it("accepting makes it what the line says, under its author's username", async () => {
      const written = await propose("ana", "bottomTypes", ["rock"]);
      const accepted = await accept(written.id);

      expect(accepted).toMatchObject({ id: written.id, status: "confirmed", current: null });
      expect(await lineOf("bottomTypes")).toMatchObject({
        value: ["rock"],
        origin: "contribution",
        contributionId: written.id,
        by: { username: "ana", rank: null },
        license: "ODbL-1.0",
        proposed: [],
      });
      // What reads the break reads it too, one at a time and by the page.
      const one = await call(v1Router.breaks.get, { id: REEF }, by("dan"));
      expect(one.characteristics.bottomTypes).toEqual(["rock"]);
      const { breaks } = await call(v1Router.breaks.list, {}, by("dan"));
      expect(breaks.find((found) => found.id === REEF)?.characteristics.bottomTypes).toEqual([
        "rock",
      ]);
      expect(breaks.find((found) => found.id === BAY)?.characteristics.bottomTypes).toBeNull();

      expect(await mine("ana")).toMatchObject({ score: 5, confirmed: 1, rank: null });
      const [recorded] = await database.db.select().from(operatorAction);
      expect(recorded).toMatchObject({
        operatorId: "owner",
        action: "contribution.accept",
        accountId: "ana",
        changes: { contributionId: written.id },
      });
      expect(await code(accept(written.id))).toBe("CONFLICT");
    });

    it("refusing tells the author why, and leaves the guide as it was", async () => {
      const written = await propose("ana", "bottomTypes", ["rock"]);
      const refused = await refuse(written.id, "It is sand all the way.");

      expect(refused).toMatchObject({ status: "refused", reason: "It is sand all the way." });
      expect((await mine("ana")).contributions).toMatchObject([
        { id: written.id, status: "refused", reason: "It is sand all the way." },
      ]);
      expect(await lineOf("bottomTypes")).toMatchObject({ value: ["sand"], origin: "list" });
      expect(await code(refuse(written.id))).toBe("CONFLICT");
    });

    it("refusing what was confirmed gives the line back what it said, and keeps a rank that was reached", async () => {
      const access = await propose("ana", "access", "Park by the church.", { language: "en" });
      const hazards = await propose("ana", "hazards", "Rocks at low tide.", { language: "en" });
      const bottom = await propose("ana", "bottomTypes", ["rock"]);
      for (const one of [access, hazards, bottom]) await accept(one.id);
      expect(await mine("ana")).toMatchObject({ score: 25, rank: "qs", next: { rank: "cs" } });

      await refuse(bottom.id, "It is sand.");
      await refuse(hazards.id, "There are none.");

      expect(await lineOf("bottomTypes")).toMatchObject({ value: ["sand"], origin: "list" });
      expect(await lineOf("hazards")).toMatchObject({ value: null, origin: null });
      // The score is what is confirmed now. The rank was reached, and stays.
      expect(await mine("ana")).toMatchObject({ score: 10, confirmed: 1, rank: "qs" });
      expect(await database.db.select().from(rankAward)).toMatchObject([
        { userId: "ana", rank: "qs" },
      ]);
      expect((await lineOf("access")).by).toEqual({ username: "ana", rank: "qs" });
    });

    it("is not a caller's who does not run the instance, or who calls from the web app", async () => {
      const written = await propose("ana", "bottomTypes", ["rock"]);
      const fromApp = { context: context("owner", WEB) };

      expect(await code(call(v1Router.reviews.accept, { id: written.id }, by("ana")))).toBe(
        "FORBIDDEN",
      );
      expect(await code(call(v1Router.reviews.accept, { id: written.id }, fromApp))).toBe(
        "FORBIDDEN",
      );
      expect(await code(call(v1Router.reviews.list, {}, by("ana")))).toBe("FORBIDDEN");
      expect(await lineOf("bottomTypes")).toMatchObject({ value: ["sand"] });
    });
  });

  describe("a text", () => {
    it("is read in the reader's language when someone wrote it, and in another otherwise", async () => {
      const french = await propose("ana", "access", "Gare-toi près de l'église.", {
        language: "fr",
      });
      await accept(french.id);
      expect(await lineOf("access", "en")).toMatchObject({
        value: "Gare-toi près de l'église.",
        language: "fr",
        license: "DbCL-1.0",
      });

      const english = await propose("ben", "access", "Park by the church.", { language: "en" });
      // Another language is another text: the first does not stand in its way.
      expect((await queue("pending"))[0]).toMatchObject({ id: english.id, current: null });
      await accept(english.id);

      expect(await lineOf("access", "en")).toMatchObject({
        value: "Park by the church.",
        by: { username: "ben" },
      });
      expect(await lineOf("access", "fr")).toMatchObject({
        value: "Gare-toi près de l'église.",
        by: { username: "ana" },
      });
    });

    it("is kept on one line", async () => {
      const written = await propose("ana", "rules", "  Wait your turn.\n\nSay   hello. ", {
        language: "en",
      });
      expect(written.value).toBe("Wait your turn. Say hello.");
    });
  });

  describe("an account whose contributions were confirmed three times", () => {
    it("has its words shown at once, as waiting to be confirmed, and its texts read first", async () => {
      await trust("ana");
      const words = await propose("ana", "bottomTypes", ["rock"]);
      const text = await propose("ana", "rules", "Wait your turn.", { language: "en" });

      expect([words.status, text.status]).toEqual(["shown", "pending"]);
      // The guide shows it beside what the line says, and the line says what it said.
      expect(await lineOf("bottomTypes")).toMatchObject({
        value: ["sand"],
        origin: "list",
        proposed: [{ id: words.id, value: ["rock"], by: { username: "ana" }, confirmations: 0 }],
      });
      const one = await call(v1Router.breaks.get, { id: REEF }, by("dan"));
      expect(one.characteristics.bottomTypes).toEqual(["sand"]);
      expect((await queue("shown")).map((found) => found.id)).toEqual([words.id]);
      expect((await mine("ana")).trusted).toBe(true);
    });

    it("is confirmed by two accounts that keep the break, and by no one who does not", async () => {
      await trust("ana");
      await trust("ben");
      await trust("cleo");
      const words = await propose("ana", "bottomTypes", ["rock"]);
      const confirm = (id: string) =>
        call(v1Router.contributions.confirm, { id: words.id }, by(id));

      // An account says nothing of its own, and one that does not keep the break says nothing.
      expect(await code(confirm("ana"))).toBe("FORBIDDEN");
      expect(await code(confirm("ben"))).toBe("FORBIDDEN");
      await keep("ben");
      await keep("cleo");
      // Nor one that keeps it and had nothing of its own confirmed.
      await keep("dan");
      expect(await code(confirm("dan"))).toBe("FORBIDDEN");

      expect(await confirm("ben")).toEqual({ status: "shown", confirmations: 1 });
      // Saying it twice is saying it once.
      expect(await confirm("ben")).toEqual({ status: "shown", confirmations: 1 });
      expect((await lineOf("bottomTypes")).proposed).toMatchObject([{ confirmations: 1 }]);
      expect(await confirm("cleo")).toEqual({ status: "confirmed", confirmations: 2 });

      expect(await lineOf("bottomTypes")).toMatchObject({
        value: ["rock"],
        origin: "contribution",
        by: { username: "ana" },
        proposed: [],
      });
      // Three texts, and a list of words.
      expect((await mine("ana")).score).toBe(35);
      expect(await code(confirm("cleo"))).toBe("CONFLICT");
      // Who confirmed is answered to nobody: it would say which breaks they keep.
      expect(JSON.stringify(await guide())).not.toMatch(/ben|cleo/);
    });

    it("is confirmed by no account whose address is not checked, where addresses are", async () => {
      await trust("ana");
      await trust("ben");
      await keep("ben");
      const words = await propose("ana", "bottomTypes", ["rock"]);
      await database.db.update(user).set({ emailVerified: false }).where(eq(user.id, "ben"));
      const checking = { context: context("ben", WEB, true) };

      expect(await code(call(v1Router.contributions.confirm, { id: words.id }, checking))).toBe(
        "FORBIDDEN",
      );
      expect(await call(v1Router.guides.mine, { breakId: REEF }, checking)).toMatchObject({
        keeps: true,
        mayConfirm: false,
      });
      // An instance that checks no address asks for none.
      expect(await call(v1Router.guides.mine, { breakId: REEF }, by("ben"))).toMatchObject({
        keeps: true,
        mayConfirm: true,
      });
    });

    it("closes what showed on a line once another is confirmed there", async () => {
      await trust("ana");
      await trust("ben");
      const one = await propose("ana", "bottomTypes", ["rock"]);
      const other = await propose("ben", "bottomTypes", ["coral"]);
      expect((await lineOf("bottomTypes")).proposed.map((found) => found.id)).toEqual([
        other.id,
        one.id,
      ]);

      await accept(other.id);

      expect(await lineOf("bottomTypes")).toMatchObject({ value: ["coral"], proposed: [] });
      expect((await mine("ana")).contributions[0]).toMatchObject({
        id: one.id,
        status: "superseded",
      });
    });
  });

  describe("an account that contests", () => {
    it("changes nothing by itself: its reason comes to the operator, and to no one else", async () => {
      const written = await propose("ana", "bottomTypes", ["rock"]);
      await accept(written.id);
      const contest = (id: string, reason = "It is sand, I surf there every week.") =>
        call(v1Router.contributions.contest, { id: written.id, reason }, by(id));

      // An account that does not keep the break contests nothing, and none contests its own.
      expect(await code(contest("ben"))).toBe("FORBIDDEN");
      await keep("ana");
      expect(await code(contest("ana"))).toBe("FORBIDDEN");
      await keep("ben");
      expect(await contest("ben")).toEqual({ contested: true });
      expect(await code(contest("ben"))).toBe("CONFLICT");

      expect(await lineOf("bottomTypes")).toMatchObject({ value: ["rock"] });
      expect(JSON.stringify(await guide())).not.toMatch(/every week|ben/);
      expect(await call(v1Router.guides.mine, { breakId: REEF }, by("ben"))).toMatchObject({
        verdicts: [{ contributionId: written.id, verdict: "contest" }],
      });
      expect(await queue("contested")).toMatchObject([
        {
          id: written.id,
          status: "confirmed",
          contests: [
            { accountId: "ben", username: "ben", reason: "It is sand, I surf there every week." },
          ],
        },
      ]);
    });

    it("does not take its reason back by confirming: a contest stays one", async () => {
      await trust("ana");
      await trust("ben");
      await keep("ben");
      const words = await propose("ana", "bottomTypes", ["rock"]);
      const said = { id: words.id, reason: "It is sand." };
      await call(v1Router.contributions.contest, said, by("ben"));

      expect(await code(call(v1Router.contributions.confirm, { id: words.id }, by("ben")))).toBe(
        "CONFLICT",
      );
      expect(await code(call(v1Router.contributions.contest, said, by("ben")))).toBe("CONFLICT");
      expect(await queue("contested")).toMatchObject([
        { id: words.id, confirmations: 0, contests: [{ accountId: "ben", reason: "It is sand." }] },
      ]);
    });

    it("may contest what it confirmed, once it knows better", async () => {
      await trust("ana");
      await trust("ben");
      await keep("ben");
      const words = await propose("ana", "bottomTypes", ["rock"]);
      await call(v1Router.contributions.confirm, { id: words.id }, by("ben"));

      expect(
        await call(
          v1Router.contributions.contest,
          { id: words.id, reason: "I looked again: it is sand." },
          by("ben"),
        ),
      ).toEqual({ contested: true });
      expect(await queue("contested")).toMatchObject([{ id: words.id, confirmations: 0 }]);
    });

    it("is read by the operator, who keeps the contribution: a contest that came since still waits", async () => {
      const written = await propose("ana", "bottomTypes", ["rock"]);
      await accept(written.id);
      await keep("ben");
      await keep("cleo");
      await call(
        v1Router.contributions.contest,
        { id: written.id, reason: "It is sand." },
        by("ben"),
      );
      const [read] = await queue("contested");
      const through = read?.contests.at(-1)?.at ?? new Date();
      await call(
        v1Router.contributions.contest,
        { id: written.id, reason: "Sand, and weed." },
        by("cleo"),
      );

      const kept = await call(v1Router.reviews.keep, { id: written.id, through }, asOperator());

      expect(kept.contests).toMatchObject([{ accountId: "cleo" }]);
      expect(await lineOf("bottomTypes")).toMatchObject({ value: ["rock"] });
      // The one whose reason was read does not give it again.
      expect(
        await code(
          call(v1Router.contributions.contest, { id: written.id, reason: "Again." }, by("ben")),
        ),
      ).toBe("CONFLICT");
      const [again] = await queue("contested");
      const later = again?.contests.at(-1)?.at ?? new Date();
      await call(v1Router.reviews.keep, { id: written.id, through: later }, asOperator());
      expect(await queue("contested")).toEqual([]);
      expect(
        await code(call(v1Router.reviews.keep, { id: written.id, through: later }, asOperator())),
      ).toBe("CONFLICT");
    });

    it("is heard: the operator refuses the contribution, and the line says what it said", async () => {
      const written = await propose("ana", "bottomTypes", ["rock"]);
      await accept(written.id);
      await keep("ben");
      await call(
        v1Router.contributions.contest,
        { id: written.id, reason: "It is sand." },
        by("ben"),
      );

      await refuse(written.id, "A reader who surfs there says it is sand.");

      expect(await lineOf("bottomTypes")).toMatchObject({ value: ["sand"], origin: "list" });
      expect(await queue("contested")).toEqual([]);
      expect((await mine("ana")).score).toBe(0);
    });

    it("has what showed and was contested confirmed by the operator who keeps it", async () => {
      await trust("ana");
      await keep("ben");
      const words = await propose("ana", "bottomTypes", ["rock"]);
      await call(
        v1Router.contributions.contest,
        { id: words.id, reason: "It is sand." },
        by("ben"),
      );

      const [read] = await queue("contested");
      const kept = await call(
        v1Router.reviews.keep,
        { id: words.id, through: read?.contests.at(-1)?.at ?? new Date() },
        asOperator(),
      );

      expect(kept.status).toBe("confirmed");
      expect(await lineOf("bottomTypes")).toMatchObject({ value: ["rock"], proposed: [] });
    });
  });

  describe("the three questions", () => {
    const answer = (id: string, question: "crowd" | "locals" | "level", given: string | null) =>
      call(v1Router.guides.answer, { breakId: REEF, question, answer: given }, by(id));
    const spread = async (question: string) =>
      (await guide()).answers.find((one) => one.question === question);

    it("show how the answers spread once three accounts gave one, and never whose", async () => {
      await answer("ana", "crowd", "busy");
      await answer("ben", "crowd", "busy");
      expect(await spread("crowd")).toEqual({ question: "crowd", total: 2, counts: null });

      const third = await answer("cleo", "crowd", "packed");
      expect(third.spread).toEqual({
        question: "crowd",
        total: 3,
        counts: { quiet: 0, shared: 0, busy: 2, packed: 1 },
      });
      expect(await spread("locals")).toEqual({ question: "locals", total: 0, counts: null });
      expect(JSON.stringify(await guide())).not.toMatch(/ana|ben|cleo/);
      expect((await call(v1Router.guides.mine, { breakId: REEF }, by("cleo"))).answers).toEqual({
        crowd: "packed",
      });
    });

    it("take one answer of an account, which it changes or takes back", async () => {
      for (const id of ["ana", "ben", "cleo"]) await answer(id, "level", "advanced");
      await answer("ana", "level", "pro");
      expect((await spread("level"))?.counts).toMatchObject({ advanced: 2, pro: 1 });

      await answer("ana", "level", null);
      expect(await spread("level")).toMatchObject({ total: 2, counts: null });
      expect(await code(answer("ana", "level", "busy"))).toBe("BAD_REQUEST");
      // An answer is no contribution: it counts for nothing.
      expect((await mine("ben")).score).toBe(0);
    });
  });

  describe("what stays", () => {
    it("is what an account wrote, when the account is deleted: it then names nobody", async () => {
      const written = await propose("ana", "bottomTypes", ["rock"]);
      await accept(written.id);
      await database.db.delete(user).where(eq(user.id, "ana"));

      expect(await lineOf("bottomTypes")).toMatchObject({
        value: ["rock"],
        origin: "contribution",
        by: null,
      });
    });

    it("is read under no name once an operator took the author's username away", async () => {
      const written = await propose("ana", "bottomTypes", ["rock"]);
      await accept(written.id);
      await call(v1Router.accounts.removeUsername, { id: "ana" }, asOperator());

      expect(await lineOf("bottomTypes")).toMatchObject({ value: ["rock"], by: null });
      expect(await code(propose("ana", "bestTides", ["high"]))).toBe("FORBIDDEN");
    });

    it("is an account's score, when a break leaves the catalogue", async () => {
      const written = await propose("ana", "bottomTypes", ["rock"]);
      await accept(written.id);
      await database.db.delete(surfBreak).where(eq(surfBreak.id, REEF));

      expect(await mine("ana")).toMatchObject({
        score: 5,
        contributions: [{ id: written.id, break: null, status: "confirmed" }],
      });
    });

    it("is a line counted once for an account, however often it wrote it", async () => {
      await accept((await propose("ana", "bottomTypes", ["rock"])).id);
      await accept((await propose("ana", "bottomTypes", ["rock", "coral"])).id);
      await accept((await propose("ana", "bottomTypes", ["sand"], { breakId: BAY })).id);

      expect(await mine("ana")).toMatchObject({ score: 10, confirmed: 2 });
      // And still once, when the break it was written of has left the catalogue.
      await database.db.delete(surfBreak).where(eq(surfBreak.id, REEF));
      expect(await mine("ana")).toMatchObject({ score: 10, confirmed: 2 });
    });
  });

  describe("two things done at the same moment", () => {
    // What two requests do at once must come to an answer of the API for each, never to a
    // fault of the database: one waits for the other.
    const outcome = async (attempt: Promise<unknown>) => code(attempt);

    it("write the rank that two confirmations reach together", async () => {
      const access = await propose("ana", "access", "Park by the church.", { language: "en" });
      const hazards = await propose("ana", "hazards", "Rocks at low tide.", { language: "en" });

      expect(await Promise.all([outcome(accept(access.id)), outcome(accept(hazards.id))])).toEqual([
        "answered",
        "answered",
      ]);

      // Ten points each: neither reaches the first rank alone.
      expect(await database.db.select().from(rankAward)).toMatchObject([
        { userId: "ana", rank: "qs" },
      ]);
    });

    it("confirm one of two that showed on a line, and close the other", async () => {
      await trust("ana");
      await trust("ben");
      const one = await propose("ana", "bottomTypes", ["rock"]);
      const other = await propose("ben", "bottomTypes", ["coral"]);

      const answers = await Promise.all([outcome(accept(one.id)), outcome(accept(other.id))]);

      expect(answers.toSorted()).toEqual(["CONFLICT", "answered"]);
      const rows = await database.db.select().from(breakContribution);
      const became = rows
        .filter((row) => row.id === one.id || row.id === other.id)
        .map((row) => row.status);
      expect(became.toSorted()).toEqual(["confirmed", "superseded"]);
    });

    it("answer both an operator and the author who writes the line again", async () => {
      for (let round = 0; round < 5; round += 1) {
        const waiting = await propose("ana", "bestTides", round % 2 ? ["low"] : ["high"]);
        const answers = await Promise.all([
          outcome(accept(waiting.id)),
          outcome(propose("ana", "bestTides", ["mid"])),
        ]);
        // The operator confirms it, or finds that its author took it back. The author's new
        // line is taken, or says what the guide has just come to say.
        expect(["answered", "CONFLICT"]).toContain(answers[0]);
        expect(["answered", "CONFLICT"]).toContain(answers[1]);
        await database.db.delete(breakContribution);
      }
    });
  });

  describe("a spot that became a break of the catalogue", () => {
    it("counts for whoever asked, and still does once they delete the spot", async () => {
      const spot = await call(
        v1Router.spots.create,
        { name: "The point", latitude: 47.9, longitude: -4.4 },
        by("ana"),
      );
      await call(v1Router.spots.requestPublication, { id: spot.id }, by("ana"));
      const [request] = (await call(v1Router.publications.list, {}, asOperator())).publications;
      const published = await call(
        v1Router.publications.accept,
        { id: request?.id ?? "", spotUpdatedAt: request?.spot.updatedAt ?? new Date() },
        asOperator(),
      );

      expect(await mine("ana")).toMatchObject({
        score: 20,
        rank: "qs",
        contributions: [
          { line: "place", value: "The point", status: "confirmed", break: { name: "The point" } },
        ],
      });
      // The break names no account, and the operator's queues do not hold it.
      expect(JSON.stringify(await guide("en", published.breakId ?? ""))).not.toContain("ana");
      expect(await queue("confirmed")).toEqual([]);

      await call(v1Router.spots.delete, { id: spot.id }, by("ana"));
      expect(await mine("ana")).toMatchObject({ score: 20, rank: "qs" });
    });

    it("is counted when the API starts, for one that the version before accepted", async () => {
      const spot = await call(
        v1Router.spots.create,
        { name: "The point", latitude: 47.9, longitude: -4.4 },
        by("ana"),
      );
      await call(v1Router.spots.requestPublication, { id: spot.id }, by("ana"));
      const [request] = (await call(v1Router.publications.list, {}, asOperator())).publications;
      const published = await call(
        v1Router.publications.accept,
        { id: request?.id ?? "", spotUpdatedAt: request?.spot.updatedAt ?? new Date() },
        asOperator(),
      );
      // The version before this one accepted a spot, and wrote nothing for it.
      await database.db.delete(breakContribution);
      await database.db.delete(rankAward);
      expect((await mine("ana")).score).toBe(0);

      await creditPublications(database.db);
      await creditPublications(database.db);

      expect(await database.db.select().from(breakContribution)).toMatchObject([
        { line: "place", value: "The point", breakId: published.breakId, userId: "ana" },
      ]);
      expect(await mine("ana")).toMatchObject({ score: 20, rank: "qs" });
      // A break that left the catalogue since is counted too, under the spot's name.
      await database.db.delete(breakContribution);
      await database.db.delete(surfBreak).where(eq(surfBreak.id, published.breakId ?? ""));
      await creditPublications(database.db);
      expect(await mine("ana")).toMatchObject({
        score: 20,
        contributions: [{ line: "place", value: "The point", break: null }],
      });
    });
  });
});
