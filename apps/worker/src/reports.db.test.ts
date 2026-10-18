import { user } from "@repo/db/schema/auth";
import { media, mediaTrash } from "@repo/db/schema/media";
import { surfReport } from "@repo/db/schema/reports";
import { surfBreak } from "@repo/db/schema/spots";
import { createTestDatabase, TEST_DATABASE_URL } from "@repo/db/testing";
import { testAnalyser } from "@repo/media/analysis";
import { testStorage, type TestStorage } from "@repo/media/testing";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { runMedia } from "./media";

// What the worker makes of the photos of a report, and what it decides of the report: decision 067.
describe.skipIf(!TEST_DATABASE_URL)("the checks of a report", () => {
  const BREAK = { latitude: 43.4832, longitude: -1.5586 };
  const BEACH = { latitude: 43.4851, longitude: -1.5571 };
  // The report is sent at ten, UTC.
  const SENT = new Date("2026-10-18T10:00:00Z");
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let storage: TestStorage;

  beforeAll(async () => {
    database = await createTestDatabase();
  });
  afterAll(() => database?.drop());
  beforeEach(async () => {
    storage = testStorage();
    await database.db.delete(user);
    await database.db.delete(surfBreak);
    await database.db.delete(mediaTrash);
    await database.db.insert(user).values({ id: "ana", name: "Ana", email: "ana@example.org" });
    await database.db
      .insert(surfBreak)
      .values({ id: "point", slug: "point", name: "Point", ...BREAK });
  });

  // A photo a phone took, with the place and the GPS's time it says, when it says them.
  async function photo(taken?: { at: { latitude: number; longitude: number }; utc: string }) {
    const image = sharp({
      create: { width: 300, height: 200, channels: 3, background: "#2a7ab0" },
    }).jpeg();
    if (!taken) return image.toBuffer();
    const dms = (value: number) => {
      const whole = Math.abs(value);
      const degrees = Math.floor(whole);
      const minutes = Math.floor((whole - degrees) * 60);
      const seconds = Math.round(((whole - degrees) * 60 - minutes) * 60 * 100);
      return `${degrees}/1 ${minutes}/1 ${seconds}/100`;
    };
    const [day, time] = taken.utc.split("T");
    const [h, m, s] = (time ?? "").replace("Z", "").split(":");
    return image
      .withExif({
        IFD3: {
          GPSLatitudeRef: taken.at.latitude >= 0 ? "N" : "S",
          GPSLatitude: dms(taken.at.latitude),
          GPSLongitudeRef: taken.at.longitude >= 0 ? "E" : "W",
          GPSLongitude: dms(taken.at.longitude),
          GPSDateStamp: (day ?? "").replaceAll("-", ":"),
          GPSTimeStamp: `${Number(h)}/1 ${Number(m)}/1 ${Number(s)}/1`,
        },
      })
      .toBuffer();
  }

  // A report as the API writes it, with its photos sent and given to it.
  async function report(
    id: string,
    photos: Buffer[],
    device: { latitude: number; longitude: number; accuracyM: number } | null = null,
  ) {
    await database.db.insert(surfReport).values({
      id,
      userId: "ana",
      breakId: "point",
      deviceLatitude: device?.latitude ?? null,
      deviceLongitude: device?.longitude ?? null,
      deviceAccuracyM: device?.accuracyM ?? null,
      offsetMinutes: -120,
      terms: "2026-10-19",
      createdAt: SENT,
    });
    for (const [position, body] of photos.entries()) {
      const mediaId = `${id}-${position}`;
      storage.put(`up/${mediaId}`, body, "image/jpeg");
      await database.db.insert(media).values({
        id: mediaId,
        userId: "ana",
        purpose: "report",
        kind: "photo",
        state: "uploaded",
        reportId: id,
        position,
        uploadKey: `up/${mediaId}`,
        uploadType: "image/jpeg",
        uploadBytes: body.byteLength,
        uploadEtag: (await storage.head(`up/${mediaId}`))?.etag ?? null,
        uploadedAt: SENT,
      });
    }
  }
  const stateOf = async (id: string) =>
    (await database.db.select().from(surfReport).where(eq(surfReport.id, id)))[0];

  it("shows a report whose photos say they were taken there lately, and of the sea", async () => {
    const analyser = testAnalyser({ sea: 0.95 });
    await report("near", [await photo({ at: BEACH, utc: "2026-10-18T09:30:00Z" })]);
    await runMedia(database.db, storage, { analyser });
    expect(await stateOf("near")).toMatchObject({ state: "published" });
    const [made] = await database.db.select().from(media).where(eq(media.reportId, "near"));
    expect(made?.checks).toMatchObject({
      verdict: "passed",
      position: { source: "file", distanceKm: 0.2, reason: null },
      time: { source: "gps", ageMinutes: 30, reason: null },
      analysis: { sea: 0.95 },
    });
    expect(analyser.seen).toBe(1);
  });

  it("refuses a photo of another place without looking at it, and forgets where the phone was", async () => {
    const analyser = testAnalyser();
    const town = { latitude: 43.4929, longitude: -1.4748 };
    await report("far", [await photo({ at: town, utc: "2026-10-18T09:50:00Z" })], {
      ...town,
      accuracyM: 10,
    });
    await runMedia(database.db, storage, { analyser });
    expect(await stateOf("far")).toMatchObject({
      state: "refused",
      deviceLatitude: null,
      deviceLongitude: null,
    });
    const [made] = await database.db.select().from(media).where(eq(media.reportId, "far"));
    expect(made?.checks).toMatchObject({
      verdict: "refused",
      reasons: ["too_far"],
      position: { point: null, distanceKm: 7 },
    });
    expect(analyser.seen).toBe(0);
  });

  it("places a photo the phone's browser stripped where the phone stood as it was sent", async () => {
    await report("stripped", [await photo()], { ...BEACH, accuracyM: 15 });
    await runMedia(database.db, storage, { analyser: testAnalyser() });
    expect(await stateOf("stripped")).toMatchObject({
      state: "published",
      deviceLatitude: BEACH.latitude,
    });
    const [made] = await database.db.select().from(media).where(eq(media.reportId, "stripped"));
    expect(made?.checks).toMatchObject({
      position: { source: "device" },
      time: { source: "sent", ageMinutes: 0 },
    });
  });

  it("refuses an old photo, and leaves to an operator one the analysis is unsure of", async () => {
    await report("old", [await photo({ at: BEACH, utc: "2026-10-18T06:00:00Z" })]);
    await runMedia(database.db, storage, { analyser: testAnalyser() });
    expect(await stateOf("old")).toMatchObject({ state: "refused" });

    await report("unsure", [await photo({ at: BEACH, utc: "2026-10-18T09:55:00Z" })]);
    await runMedia(database.db, storage, { analyser: testAnalyser({ sea: 0.45 }) });
    expect(await stateOf("unsure")).toMatchObject({ state: "review" });
  });

  it("refuses a report one of whose files is no photo, and decides it once all are done", async () => {
    await report("broken", [
      await photo({ at: BEACH, utc: "2026-10-18T09:55:00Z" }),
      Buffer.from("not a photo"),
    ]);
    await runMedia(database.db, storage, { analyser: testAnalyser() });
    expect(await stateOf("broken")).toMatchObject({ state: "refused" });
    const kinds = await database.db.select().from(media).where(eq(media.reportId, "broken"));
    expect(kinds.map((one) => one.state).sort()).toEqual(["failed", "ready"]);
  });

  it("leaves to an operator what the models could not look at", async () => {
    await report("blind", [await photo({ at: BEACH, utc: "2026-10-18T09:55:00Z" })]);
    const broken = { analyse: () => Promise.reject(new Error("no model in this folder")) };
    await runMedia(database.db, storage, { analyser: broken });
    expect(await stateOf("blind")).toMatchObject({ state: "review" });
  });

  it("makes no photo sent for a report before the report is written", async () => {
    storage.put("up/early", await photo(), "image/jpeg");
    await database.db.insert(media).values({
      id: "early",
      userId: "ana",
      purpose: "report",
      kind: "photo",
      state: "uploaded",
      uploadKey: "up/early",
      uploadType: "image/jpeg",
      uploadBytes: (await storage.head("up/early"))?.bytes ?? 0,
      uploadedAt: SENT,
    });
    expect(await runMedia(database.db, storage, { analyser: testAnalyser() })).toMatchObject({
      ready: 0,
    });
  });

  it("deletes the reports older than the instance keeps, when it says how long", async () => {
    await report("kept", [await photo({ at: BEACH, utc: "2026-10-18T09:55:00Z" })]);
    await runMedia(database.db, storage, { analyser: testAnalyser() });
    // Without the setting, every report is kept.
    expect(await stateOf("kept")).toBeDefined();
    const later = SENT.getTime() + 31 * 24 * 60 * 60 * 1000;
    await runMedia(database.db, storage, { keepReportDays: 30, now: () => later });
    expect(await stateOf("kept")).toBeUndefined();
    await runMedia(database.db, storage, { now: () => later });
    expect(storage.keys()).toEqual([]);
  });
});
