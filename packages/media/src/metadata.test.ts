import { readFile } from "node:fs/promises";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { readIso6709, readPhoto, readVideo } from "./metadata";

const blue = () => sharp({ create: { width: 64, height: 48, channels: 3, background: "#2a7ab0" } });

describe("what a photo says of where and when it was taken", () => {
  it("reads the GPS's place and its time, which is UTC", async () => {
    const photo = await blue()
      .jpeg()
      .withExif({
        IFD2: { DateTimeOriginal: "2026:10:18 11:30:00", OffsetTimeOriginal: "+02:00" },
        IFD3: {
          GPSLatitudeRef: "N",
          GPSLatitude: "43/1 28/1 59/1",
          GPSLongitudeRef: "W",
          GPSLongitude: "1/1 33/1 31/1",
          GPSDateStamp: "2026:10:18",
          GPSTimeStamp: "9/1 29/1 58/1",
        },
      })
      .toBuffer();
    const taken = await readPhoto(photo);
    expect(taken.point?.latitude).toBeCloseTo(43.4831, 3);
    expect(taken.point?.longitude).toBeCloseTo(-1.5586, 3);
    expect(taken.time).toEqual({ source: "gps", at: new Date("2026-10-18T09:29:58Z") });
  });

  it("reads the camera's time with its offset, or alone, when there is no GPS", async () => {
    const withOffset = await blue()
      .jpeg()
      .withExif({ IFD2: { DateTimeOriginal: "2026:10:18 11:30:00", OffsetTimeOriginal: "+02:00" } })
      .toBuffer();
    expect(await readPhoto(withOffset)).toEqual({
      point: null,
      time: { source: "offset", at: new Date("2026-10-18T09:30:00Z") },
    });
    const alone = await blue()
      .jpeg()
      .withExif({ IFD2: { DateTimeOriginal: "2026:10:18 11:30:00" } })
      .toBuffer();
    expect((await readPhoto(alone)).time).toEqual({
      source: "local",
      local: "2026:10:18 11:30:00",
    });
  });

  it("says nothing of a photo that says nothing, or of no photo", async () => {
    expect(await readPhoto(await blue().jpeg().toBuffer())).toEqual({ point: null, time: null });
    expect(await readPhoto(new TextEncoder().encode("nothing"))).toEqual({
      point: null,
      time: null,
    });
  });

  it("reads a phone's HEIF", async () => {
    const file = await readFile(new URL("./samples/tiny.heic", import.meta.url));
    expect(await readPhoto(file)).toMatchObject({ point: null });
  });
});

describe("what a video says of where and when it was filmed", () => {
  it("reads a phone's place and its date with its offset", () => {
    expect(readIso6709("+43.4832-001.5586+012.345/")).toEqual({
      latitude: 43.4832,
      longitude: -1.5586,
    });
    expect(readIso6709("+00.0000+000.0000/")).toBeNull();
    expect(readIso6709("somewhere")).toBeNull();
    expect(
      readVideo({ location: "+43.4832-001.5586/", creationTime: "2026-10-18T11:30:00+0200" }),
    ).toEqual({
      point: { latitude: 43.4832, longitude: -1.5586 },
      time: { source: "video", at: new Date("2026-10-18T09:30:00Z") },
    });
    expect(readVideo({ location: null, creationTime: "2026-10-18T09:30:00.000000Z" }).time).toEqual(
      {
        source: "video",
        at: new Date("2026-10-18T09:30:00Z"),
      },
    );
  });
});
