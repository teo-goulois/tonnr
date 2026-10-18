import { call, ORPCError } from "@orpc/server";
import type { Session } from "@repo/auth";
import { operator, operatorAction } from "@repo/db/schema/access";
import { user } from "@repo/db/schema/auth";
import { media, mediaPause, mediaSentDay, mediaSentHour, mediaTrash } from "@repo/db/schema/media";
import { surfSession } from "@repo/db/schema/sessions";
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

// The photos and the videos of a session: decision 066.
describe.skipIf(!TEST_DATABASE_URL)("the photos and the videos of a session", () => {
  const WEB = "https://app.example.org";
  const AT = new Date("2026-10-10T12:20:00Z");
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
    await db.delete(mediaPause);
    await db.delete(mediaSentDay);
    await db.insert(user).values([
      { id: "ana", name: "Ana", email: "ana@example.org" },
      { id: "ben", name: "Ben", email: "ben@example.org" },
    ]);
    await db
      .insert(surfBreak)
      .values({ id: "point", slug: "point", name: "The point", latitude: 47.84, longitude: -4.35 });
    await db.insert(surfSession).values([
      {
        id: "s1",
        userId: "ana",
        breakId: "point",
        placeName: "The point",
        latitude: 47.84,
        longitude: -4.35,
        startedAt: new Date("2026-10-10T09:00:00Z"),
        durationMinutes: 90,
      },
      {
        id: "s2",
        userId: "ana",
        breakId: "point",
        placeName: "The point",
        latitude: 47.84,
        longitude: -4.35,
        startedAt: new Date("2026-10-09T09:00:00Z"),
        durationMinutes: 60,
      },
      {
        id: "b1",
        userId: "ben",
        breakId: "point",
        placeName: "The point",
        latitude: 47.84,
        longitude: -4.35,
        startedAt: new Date("2026-10-10T09:00:00Z"),
        durationMinutes: 60,
      },
    ]);
  });

  const by = (id: string, kept: TestStorage | null = storage) => {
    const context: Context = {
      db: database.db,
      session: {
        user: { id, name: id, email: `${id}@example.org`, emailVerified: false },
        session: { id: `s-${id}`, userId: id, token: `t-${id}`, expiresAt: new Date("2030-01-01") },
      } as Session,
      authorization: null,
      site: WEB,
      adminSites: [],
      usage,
      forecasts: testForecasts().forecasts,
      places: testPlaces().places,
      verification: testVerification(database.db, { on: false }).verification,
      reply: {},
      server: { startedAt: new Date("2026-10-10T08:00:00Z"), webOrigin: WEB },
      storage: kept,
    };
    return { context };
  };
  const refusal = (code: string) =>
    expect.objectContaining({ code }) as unknown as ORPCError<string, unknown>;
  const photo = { purpose: "session" as const, contentType: "image/jpeg", bytes: 3 * MB };

  // What a browser does: asks where, sends the file there, and says it is sent.
  async function send(who: string, bytes = 3 * MB, contentType = "image/jpeg") {
    const asked = await call(v1Router.media.prepare, { ...photo, bytes, contentType }, by(who));
    storage.put(`up/${asked.id}`, new Uint8Array(bytes), contentType);
    return call(v1Router.media.uploaded, { id: asked.id }, by(who));
  }

  it("signs an upload of the type and the size that were said, for fifteen minutes", async () => {
    const asked = await call(v1Router.media.prepare, photo, by("ana"));
    expect(asked.kind).toBe("photo");
    expect(asked.upload.headers).toEqual({ "Content-Type": "image/jpeg" });
    expect(asked.expiresAt).toEqual(new Date(AT.getTime() + 15 * 60 * 1000));
    expect(storage.signed).toEqual([
      { key: `up/${asked.id}`, contentType: "image/jpeg", bytes: 3 * MB },
    ]);
    const [row] = await database.db.select().from(media).where(eq(media.id, asked.id));
    expect(row).toMatchObject({ userId: "ana", state: "awaiting_upload", sessionId: null });
  });

  it("refuses what is no photo or video, what is too big, and a video too long", async () => {
    await expect(
      call(v1Router.media.prepare, { ...photo, contentType: "image/svg+xml" }, by("ana")),
    ).rejects.toEqual(refusal("BAD_REQUEST"));
    await expect(
      call(v1Router.media.prepare, { ...photo, bytes: 41 * MB }, by("ana")),
    ).rejects.toEqual(refusal("BAD_REQUEST"));
    await expect(
      call(
        v1Router.media.prepare,
        { ...photo, contentType: "video/quicktime", bytes: 90 * MB, durationSeconds: 75 },
        by("ana"),
      ),
    ).rejects.toEqual(refusal("BAD_REQUEST"));
    const video = await call(
      v1Router.media.prepare,
      { ...photo, contentType: "video/quicktime", bytes: 900 * MB, durationSeconds: 59.8 },
      by("ana"),
    );
    expect(video.kind).toBe("video");
  });

  it("says whether the instance takes media, and how much the account keeps", async () => {
    expect(await call(v1Router.media.status, undefined, by("ana", null))).toMatchObject({
      offered: false,
      keptBytes: 0,
    });
    await call(v1Router.media.prepare, photo, by("ana"));
    expect(await call(v1Router.media.status, undefined, by("ana"))).toEqual({
      offered: true,
      paused: false,
      keptBytes: 3 * MB,
      mostBytes: 2048 * MB,
    });
  });

  it("takes nothing on an instance that keeps no media, or while an operator stopped uploads", async () => {
    await expect(call(v1Router.media.prepare, photo, by("ana", null))).rejects.toEqual(
      refusal("SERVICE_UNAVAILABLE"),
    );
    await database.db.insert(mediaPause).values({});
    await expect(call(v1Router.media.prepare, photo, by("ana"))).rejects.toEqual(
      refusal("SERVICE_UNAVAILABLE"),
    );
  });

  it("keeps an account to 2 GB, counting what waits at the size it was said", async () => {
    await database.db.insert(media).values({
      id: "kept",
      userId: "ana",
      purpose: "session",
      kind: "video",
      state: "ready",
      uploadKey: "up/kept",
      uploadType: "video/mp4",
      uploadBytes: 1000 * MB,
      bytes: 1510 * MB,
    });
    await call(
      v1Router.media.prepare,
      { ...photo, contentType: "video/mp4", bytes: 500 * MB },
      by("ana"),
    );
    await expect(
      call(v1Router.media.prepare, { ...photo, bytes: 40 * MB }, by("ana")),
    ).rejects.toEqual(refusal("FORBIDDEN"));
    // Another account has its own.
    await call(v1Router.media.prepare, { ...photo, bytes: 40 * MB }, by("ben"));
  });

  it("signs forty uploads an hour for an account", async () => {
    for (let index = 0; index < 40; index += 1) {
      await call(v1Router.media.prepare, { ...photo, bytes: 1000 }, by("ana"));
    }
    const asking = by("ana");
    await expect(call(v1Router.media.prepare, { ...photo, bytes: 1000 }, asking)).rejects.toEqual(
      refusal("TOO_MANY_REQUESTS"),
    );
    expect(asking.context.reply.retryAfterSeconds).toBe(3600);
    vi.setSystemTime(new Date(AT.getTime() + 61 * 60 * 1000));
    await call(v1Router.media.prepare, { ...photo, bytes: 1000 }, by("ana"));
  });

  it("gives nothing back of the hour for a file that is deleted", async () => {
    for (let index = 0; index < 40; index += 1) {
      const asked = await call(v1Router.media.prepare, { ...photo, bytes: 1000 }, by("ana"));
      await call(v1Router.media.discard, { id: asked.id }, by("ana"));
    }
    await expect(
      call(v1Router.media.prepare, { ...photo, bytes: 1000 }, by("ana")),
    ).rejects.toEqual(refusal("TOO_MANY_REQUESTS"));
  });

  it("takes no more than the instance's day, and gives back the hour of a request it refuses", async () => {
    await database.db
      .insert(mediaSentDay)
      .values({ day: "2026-10-10", bytes: 20 * 1024 * MB - 2 * MB });
    await call(v1Router.media.prepare, { ...photo, bytes: 2 * MB }, by("ana"));
    await expect(call(v1Router.media.prepare, { ...photo, bytes: 1 }, by("ben"))).rejects.toEqual(
      refusal("SERVICE_UNAVAILABLE"),
    );
    const hours = await database.db.select().from(mediaSentHour);
    expect(hours.map((row) => [row.userId, row.files])).toEqual([["ana", 1]]);
    // The next day has its own.
    vi.setSystemTime(new Date("2026-10-11T00:10:00Z"));
    await call(v1Router.media.prepare, { ...photo, bytes: 1 }, by("ben"));
  });

  it("takes a file once the bucket holds it as it was said, and drops one that is not", async () => {
    const asked = await call(v1Router.media.prepare, photo, by("ana"));
    await expect(call(v1Router.media.uploaded, { id: asked.id }, by("ana"))).rejects.toEqual(
      refusal("CONFLICT"),
    );
    // Another account cannot say it for this one.
    storage.put(`up/${asked.id}`, new Uint8Array(3 * MB), "image/jpeg");
    await expect(call(v1Router.media.uploaded, { id: asked.id }, by("ben"))).rejects.toEqual(
      refusal("NOT_FOUND"),
    );
    const sent = await call(v1Router.media.uploaded, { id: asked.id }, by("ana"));
    expect(sent).toMatchObject({ state: "processing", thumb: null });
    const [row] = await database.db.select().from(media).where(eq(media.id, asked.id));
    expect(row?.uploadEtag).toBeTruthy();

    const other = await call(v1Router.media.prepare, photo, by("ana"));
    storage.put(`up/${other.id}`, new Uint8Array(5 * MB), "image/jpeg");
    expect(await call(v1Router.media.uploaded, { id: other.id }, by("ana"))).toMatchObject({
      state: "failed",
      failure: "changed",
    });
    expect(storage.keys()).not.toContain(`up/${other.id}`);
  });

  it("gives a session its media in order, and deletes those it no longer lists", async () => {
    const first = await send("ana");
    const second = await send("ana", 2 * MB, "video/mp4");
    const third = await send("ana");
    await call(v1Router.sessions.update, { id: "s1", mediaIds: [second.id, first.id] }, by("ana"));
    let rows = await database.db.select().from(media).where(eq(media.sessionId, "s1"));
    expect(rows.map((row) => [row.id, row.position]).sort()).toEqual(
      [
        [second.id, 0],
        [first.id, 1],
      ].sort(),
    );

    // One that belongs to another session, or to another account, is not given.
    await expect(
      call(v1Router.sessions.update, { id: "s2", mediaIds: [first.id] }, by("ana")),
    ).rejects.toEqual(refusal("CONFLICT"));
    await expect(
      call(v1Router.sessions.update, { id: "b1", mediaIds: [third.id] }, by("ben")),
    ).rejects.toEqual(refusal("NOT_FOUND"));

    await call(v1Router.sessions.update, { id: "s1", mediaIds: [third.id, first.id] }, by("ana"));
    rows = await database.db.select().from(media).where(eq(media.sessionId, "s1"));
    expect(rows.map((row) => row.id).sort()).toEqual([first.id, third.id].sort());
    expect(await database.db.select().from(media).where(eq(media.id, second.id))).toEqual([]);
    const trash = await database.db.select().from(mediaTrash);
    expect(trash.flatMap((row) => row.keys)).toEqual([`up/${second.id}`]);
  });

  it("answers a session's media with addresses that stay the same through the hour", async () => {
    const sent = await send("ana");
    await call(v1Router.sessions.update, { id: "s1", mediaIds: [sent.id] }, by("ana"));
    const files = {
      thumb: {
        key: `m/${sent.id}/thumb.webp`,
        contentType: "image/webp",
        bytes: 20_000,
        width: 640,
        height: 480,
      },
      display: {
        key: `m/${sent.id}/display.avif`,
        contentType: "image/avif",
        bytes: 300_000,
        width: 2560,
        height: 1920,
      },
    };
    await database.db
      .update(media)
      .set({ state: "ready", files, bytes: 320_000, width: 2560, height: 1920 })
      .where(eq(media.id, sent.id));

    const listed = await call(
      v1Router.media.sessions,
      { sessionIds: ["s1", "s2", "b1"] },
      by("ana"),
    );
    expect(Object.keys(listed.sessions)).toEqual(["s1"]);
    const [item] = listed.sessions.s1 ?? [];
    expect(item).toMatchObject({
      id: sent.id,
      kind: "photo",
      state: "ready",
      width: 2560,
      video: null,
    });
    // Signed at the start of the hour, for two hours.
    const hour = new Date("2026-10-10T12:00:00Z").getTime();
    expect(item?.thumb).toBe(
      `https://storage.test/m/${sent.id}/thumb.webp?signed=${hour}&expires=7200`,
    );
    vi.setSystemTime(new Date("2026-10-10T12:59:00Z"));
    const again = await call(v1Router.media.sessions, { sessionIds: ["s1"] }, by("ana"));
    expect(again.sessions.s1?.[0]?.thumb).toBe(item?.thumb);

    // Another account reads none of them.
    expect(await call(v1Router.media.sessions, { sessionIds: ["s1"] }, by("ben"))).toEqual({
      sessions: {},
    });
  });

  it("gives a new session the media sent from its form", async () => {
    const sent = await send("ana");
    const made = await call(
      v1Router.sessions.create,
      { breakId: "point", startedAt: new Date("2026-10-10T10:00:00Z"), mediaIds: [sent.id] },
      by("ana"),
    );
    const [row] = await database.db.select().from(media).where(eq(media.id, sent.id));
    expect(row?.sessionId).toBe(made.id);
    // The session's own answer says nothing of them, as an assistant reads it.
    expect(made).not.toHaveProperty("media");
  });

  it("leaves the keys of whatever goes for the worker to delete", async () => {
    const one = await send("ana");
    const two = await send("ana");
    const three = await send("ben");
    await call(v1Router.sessions.update, { id: "s1", mediaIds: [one.id] }, by("ana"));
    await call(v1Router.media.discard, { id: two.id }, by("ana"));
    await expect(call(v1Router.media.discard, { id: three.id }, by("ana"))).rejects.toEqual(
      refusal("NOT_FOUND"),
    );
    await call(v1Router.sessions.delete, { id: "s1" }, by("ana"));
    await database.db.delete(user).where(eq(user.id, "ben"));
    const keys = (await database.db.select().from(mediaTrash)).flatMap((row) => row.keys).sort();
    expect(keys).toEqual([`up/${one.id}`, `up/${two.id}`, `up/${three.id}`].sort());
    expect(await database.db.select().from(media)).toEqual([]);
  });

  describe("an operator", () => {
    // An operator's request names the admin's site: decision 020.
    const ADMIN = "https://admin.example.org";
    const fromAdmin = (id: string, kept: TestStorage | null = storage) => {
      const context: Context = { ...by(id, kept).context, site: ADMIN, adminSites: [ADMIN] };
      return { context };
    };
    const uploads = (on: boolean, asking = fromAdmin("ben")) =>
      call(v1Router.media.uploads, { on }, asking);

    beforeEach(async () => {
      await database.db.insert(operator).values({ userId: "ben" });
    });

    it("alone stops every upload, from the admin's site, and starts them again", async () => {
      // An account that is no operator is refused, and so is an operator from the web app.
      await expect(uploads(false, fromAdmin("ana"))).rejects.toEqual(refusal("FORBIDDEN"));
      await expect(uploads(false, by("ben"))).rejects.toEqual(refusal("FORBIDDEN"));
      await call(v1Router.media.prepare, photo, by("ana"));

      const { pausedAt } = await uploads(false);
      expect(pausedAt).toBeInstanceOf(Date);
      await expect(call(v1Router.media.prepare, photo, by("ana"))).rejects.toEqual(
        refusal("SERVICE_UNAVAILABLE"),
      );
      // Stopped twice, they are stopped since the first time.
      expect(await uploads(false)).toEqual({ pausedAt });

      expect(await uploads(true)).toEqual({ pausedAt: null });
      expect(await uploads(true)).toEqual({ pausedAt: null });
      await call(v1Router.media.prepare, photo, by("ana"));

      // Each change is recorded once, and what changed nothing is not.
      const done = await database.db
        .select()
        .from(operatorAction)
        .where(inArray(operatorAction.action, ["media.off", "media.on"]))
        .orderBy(operatorAction.at);
      expect(done.map((action) => [action.action, action.operatorId])).toEqual([
        ["media.off", "ben"],
        ["media.on", "ben"],
      ]);
    });

    it("reads what the instance keeps, what waits, and since when uploads are stopped", async () => {
      const row = {
        userId: "ana",
        purpose: "session" as const,
        kind: "photo" as const,
        uploadType: "image/jpeg",
        uploadBytes: 3 * MB,
      };
      await database.db.insert(media).values([
        { ...row, id: "r1", uploadKey: "up/r1", state: "ready", bytes: 300_000 },
        { ...row, id: "r2", uploadKey: "up/r2", state: "ready", bytes: 200_000 },
        { ...row, id: "w1", uploadKey: "up/w1", state: "awaiting_upload" },
        { ...row, id: "w2", uploadKey: "up/w2", state: "uploaded" },
        { ...row, id: "f1", uploadKey: "up/f1", state: "failed", failure: "unreadable" },
      ]);
      const before = await call(v1Router.instance.state, undefined, fromAdmin("ben"));
      expect(before.media).toEqual({
        offered: true,
        pausedAt: null,
        ready: 2,
        bytes: 500_000,
        waiting: 2,
        failed: 1,
      });

      const { pausedAt } = await uploads(false);
      // An instance whose bucket's settings are not set keeps none.
      const after = await call(v1Router.instance.state, undefined, fromAdmin("ben", null));
      expect(after.media).toMatchObject({ offered: false, pausedAt });
    });
  });
});
