import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { user } from "@repo/db/schema/auth";
import { media, mediaTrash } from "@repo/db/schema/media";
import { surfSession } from "@repo/db/schema/sessions";
import { createTestDatabase, TEST_DATABASE_URL } from "@repo/db/testing";
import { testStorage, type TestStorage } from "@repo/media/testing";
import { eq } from "drizzle-orm";
import exifr from "exifr";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { MOST_ATTEMPTS, mediaDone, runMedia } from "./media";

const hasFfmpeg = (() => {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

// What the worker makes of the photos and the videos accounts send: decision 066.
describe.skipIf(!TEST_DATABASE_URL)("the photos and the videos the worker makes", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let storage: TestStorage;

  beforeAll(async () => {
    database = await createTestDatabase();
  });
  afterAll(() => database?.drop());
  beforeEach(async () => {
    storage = testStorage();
    await database.db.delete(user);
    await database.db.delete(mediaTrash);
    await database.db.insert(user).values({ id: "ana", name: "Ana", email: "ana@example.org" });
    await database.db.insert(surfSession).values({
      id: "s1",
      userId: "ana",
      placeName: "The point",
      latitude: 47.84,
      longitude: -4.35,
      startedAt: new Date("2026-10-10T09:00:00Z"),
      durationMinutes: 90,
    });
  });

  // A file in the bucket, as a browser sent it, and its row as the API wrote it.
  async function sent(
    id: string,
    body: Uint8Array,
    contentType: string,
    kind: "photo" | "video" = "photo",
  ) {
    storage.put(`up/${id}`, body, contentType);
    const held = await storage.head(`up/${id}`);
    await database.db.insert(media).values({
      id,
      userId: "ana",
      purpose: "session",
      kind,
      state: "uploaded",
      sessionId: "s1",
      uploadKey: `up/${id}`,
      uploadType: contentType,
      uploadBytes: body.byteLength,
      uploadEtag: held?.etag ?? null,
      uploadedAt: new Date(),
    });
  }
  const rowOf = async (id: string) =>
    (await database.db.select().from(media).where(eq(media.id, id)))[0];

  it("makes what is shown of a photo, with nothing of where it was taken, and lets the file sent go", async () => {
    const photo = await sharp({
      create: { width: 1200, height: 900, channels: 3, background: "#1d6fa3" },
    })
      .jpeg()
      .withExif({
        IFD3: {
          GPSLatitudeRef: "N",
          GPSLatitude: "43/1 28/1 0/1",
          GPSLongitudeRef: "W",
          GPSLongitude: "1/1 34/1 0/1",
        },
      })
      .toBuffer();
    await sent("p1", photo, "image/jpeg");

    const run = await runMedia(database.db, storage);
    expect(run).toMatchObject({ ready: 1, failed: 0, retried: 0 });
    const row = await rowOf("p1");
    expect(row).toMatchObject({ state: "ready", width: 1200, height: 900, claim: null });
    expect(Object.keys(row?.files ?? {}).sort()).toEqual(["display", "thumb"]);
    expect(row?.bytes).toBe((row?.files.display?.bytes ?? 0) + (row?.files.thumb?.bytes ?? 0));
    expect(storage.keys().sort()).toEqual(["m/p1/1/display.avif", "m/p1/1/thumb.webp"]);
    const display = await new Response(await storage.read("m/p1/1/display.avif")).arrayBuffer();
    expect(await exifr.gps(Buffer.from(display)).catch(() => undefined)).toBeUndefined();
    expect(mediaDone(run).counts.ready).toBe(1);
  });

  it("refuses what is no photo, and a file that was put again after it was said sent", async () => {
    await sent("bad", new TextEncoder().encode("not a photo at all"), "image/jpeg");
    await sent("swapped", new Uint8Array(10), "image/jpeg");
    // Sent again under the same key, after the API heard of the first.
    storage.put("up/swapped", new Uint8Array(10), "image/jpeg");

    const run = await runMedia(database.db, storage);
    expect(run).toMatchObject({ ready: 0, failed: 2 });
    expect(await rowOf("bad")).toMatchObject({ state: "failed", failure: "unreadable" });
    expect(await rowOf("swapped")).toMatchObject({ state: "failed", failure: "changed" });
    expect(storage.keys()).toEqual([]);
  });

  it("tries a file the bucket cannot give again later, and gives up after three tries", async () => {
    const photo = await sharp({
      create: { width: 10, height: 10, channels: 3, background: "#000" },
    })
      .jpeg()
      .toBuffer();
    await sent("flaky", photo, "image/jpeg");
    const failing: TestStorage = {
      ...storage,
      read: () => Promise.reject(new Error("the bucket did not answer")),
    };
    expect(await runMedia(database.db, failing)).toMatchObject({ retried: 1, ready: 0 });
    const held = await rowOf("flaky");
    expect(held).toMatchObject({ state: "uploaded", attempts: 1, claim: null });
    // Held back for a few minutes: the next run does not take it.
    expect(held?.claimedUntil?.getTime()).toBeGreaterThan(Date.now());
    expect(await runMedia(database.db, failing)).toMatchObject({ retried: 0 });

    await database.db
      .update(media)
      .set({ attempts: MOST_ATTEMPTS, claimedUntil: null })
      .where(eq(media.id, "flaky"));
    expect(await runMedia(database.db, failing)).toMatchObject({ failed: 1 });
    expect(await rowOf("flaky")).toMatchObject({ state: "failed", failure: "gave_up" });
  });

  it("lets go of what was never used a day after, and deletes from the bucket what nothing keeps", async () => {
    const day = 24 * 60 * 60 * 1000;
    storage.put("up/old", new Uint8Array(5), "image/jpeg");
    storage.put("up/fresh", new Uint8Array(5), "image/jpeg");
    storage.put("up/lost", new Uint8Array(5), "image/jpeg");
    const row = (
      id: string,
      ago: number,
      sessionId: string | null,
      state: "ready" | "awaiting_upload",
    ) => ({
      id,
      userId: "ana",
      purpose: "session" as const,
      kind: "photo" as const,
      state,
      sessionId,
      uploadKey: `up/${id}`,
      uploadType: "image/jpeg",
      uploadBytes: 5,
      createdAt: new Date(Date.now() - ago),
    });
    await database.db.insert(media).values([
      row("old", day + 60_000, null, "ready"),
      row("fresh", 60_000, null, "ready"),
      // Given to a session before it was sent, and never sent.
      row("lost", day + 60_000, "s1", "awaiting_upload"),
      row("kept", day + 60_000, "s1", "ready"),
    ]);

    const run = await runMedia(database.db, storage);
    expect(run).toMatchObject({ abandoned: 2, trashed: 2, trashLeft: 0 });
    const left = (await database.db.select({ id: media.id }).from(media)).map((one) => one.id);
    expect(left.sort()).toEqual(["fresh", "kept"]);
    expect(storage.keys().sort()).toEqual(["up/fresh"]);
    expect(await database.db.select().from(mediaTrash)).toEqual([]);
  });

  it("keeps in the trash what the bucket would not delete, and tries again", async () => {
    await database.db.insert(mediaTrash).values({ keys: ["m/gone/display.avif"] });
    storage.put("m/gone/display.avif", new Uint8Array(3), "image/avif");
    const refusing: TestStorage = {
      ...storage,
      remove: () => Promise.reject(new Error("The bucket kept 1 of 1 files")),
    };
    expect(await runMedia(database.db, refusing)).toMatchObject({ trashed: 0, trashFailed: 1 });
    const [kept] = await database.db.select().from(mediaTrash);
    expect(kept).toMatchObject({ keys: ["m/gone/display.avif"], attempts: 1 });
    expect(await runMedia(database.db, storage)).toMatchObject({ trashed: 1, trashLeft: 0 });
    expect(storage.keys()).toEqual([]);
  });

  it("keeps what a later try wrote, whatever the trash holds of a try that failed", async () => {
    const photo = await sharp({
      create: { width: 40, height: 30, channels: 3, background: "#123" },
    })
      .jpeg()
      .toBuffer();
    await sent("again", photo, "image/jpeg");
    // The bucket takes the first file, refuses the second, and deletes nothing: what the first
    // try wrote goes to the trash.
    const failing: TestStorage = {
      ...storage,
      write: async (key, body, type) => {
        if (key.endsWith("thumb.webp")) throw new Error("The bucket did not answer");
        await storage.write(key, body, type);
      },
      remove: () => Promise.reject(new Error("The bucket did not answer")),
    };
    expect(await runMedia(database.db, failing)).toMatchObject({ retried: 1 });
    await database.db.update(media).set({ claimedUntil: null }).where(eq(media.id, "again"));
    // The key of the file it was writing when the bucket failed goes to the trash too.
    expect(await runMedia(database.db, storage)).toMatchObject({ ready: 1, trashed: 2 });
    const row = await rowOf("again");
    expect(storage.keys().sort()).toEqual([row?.files.display?.key, row?.files.thumb?.key].sort());
    expect(row?.files.display?.key).toBe("m/again/2/display.avif");
  });

  it("deletes what it wrote of a photo that failed half way", async () => {
    const photo = await sharp({
      create: { width: 40, height: 30, channels: 3, background: "#123" },
    })
      .jpeg()
      .toBuffer();
    await sent("half", photo, "image/jpeg");
    // The bucket takes the first file and refuses the second, every time.
    const halfway: TestStorage = {
      ...storage,
      write: async (key, body, type) => {
        if (key.endsWith("thumb.webp")) throw new Error("The bucket did not answer");
        await storage.write(key, body, type);
      },
    };
    expect(await runMedia(database.db, halfway)).toMatchObject({ retried: 1 });
    expect(storage.keys()).toEqual(["up/half"]);
  });

  it.skipIf(!hasFfmpeg)(
    "makes a video, its poster and its small picture",
    { timeout: 60_000 },
    async () => {
      const folder = await mkdtemp(join(tmpdir(), "worker-video-"));
      try {
        const path = join(folder, "clip.mp4");
        execFileSync("ffmpeg", [
          "-hide_banner",
          "-loglevel",
          "error",
          "-f",
          "lavfi",
          "-i",
          "testsrc2=size=320x240:rate=25:duration=2",
          "-c:v",
          "libx264",
          "-y",
          path,
        ]);
        await sent("v1", await readFile(path), "video/mp4", "video");
        expect(await runMedia(database.db, storage)).toMatchObject({ ready: 1 });
        const row = await rowOf("v1");
        expect(row).toMatchObject({ state: "ready", width: 320, height: 240, durationMs: 2000 });
        expect(Object.keys(row?.files ?? {}).sort()).toEqual(["poster", "thumb", "video"]);
        expect(storage.keys().sort()).toEqual([
          "m/v1/1/poster.webp",
          "m/v1/1/thumb.webp",
          "m/v1/1/video.mp4",
        ]);
      } finally {
        await rm(folder, { recursive: true, force: true });
      }
    },
  );
});
