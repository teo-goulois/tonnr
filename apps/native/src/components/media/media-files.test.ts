import { describe, expect, it } from "vitest";

import {
  firstTakenAt,
  judgePicked,
  nameOfPicked,
  takenAt,
  typeOfPicked,
  videoLength,
  videoSecondsOf,
} from "./media-files";

const MB = 1024 * 1024;

describe("a file the phone gives", () => {
  it("is sent as the type the phone says, or as the one its name says", () => {
    expect(typeOfPicked({ uri: "file:///a/IMG_1.HEIC", mimeType: "image/HEIC" })).toBe(
      "image/heic",
    );
    expect(typeOfPicked({ uri: "file:///a/IMG_2.MOV" })).toBe("video/quicktime");
    expect(typeOfPicked({ uri: "file:///a/clip", fileName: "clip.mp4" })).toBe("video/mp4");
    expect(typeOfPicked({ uri: "file:///a/notes.txt" })).toBe("");
  });

  it("is named by its own name, or by where the phone keeps it", () => {
    expect(nameOfPicked({ uri: "file:///a/b/IMG%201.jpg" })).toBe("IMG 1.jpg");
    expect(nameOfPicked({ uri: "file:///a/x.jpg", fileName: "Beach.jpg" })).toBe("Beach.jpg");
  });

  it("is refused for its type or its size before anything is asked", () => {
    expect(judgePicked({ uri: "a.jpg" }, 3 * MB)).toBe("photo");
    expect(judgePicked({ uri: "a.mov" }, 300 * MB)).toBe("video");
    expect(judgePicked({ uri: "a.pdf" }, MB)).toBe("type");
    expect(judgePicked({ uri: "a.jpg" }, 41 * MB)).toBe("size");
  });

  it("says how long a video lasts in seconds, and nothing when it does not know", () => {
    expect(videoSecondsOf({ duration: 42_500 })).toBe(42.5);
    expect(videoSecondsOf({ duration: null })).toBeNull();
    expect(videoSecondsOf({})).toBeNull();
    expect(videoLength(42_500)).toBe("0:43");
    expect(videoLength(61_000)).toBe("1:01");
  });
});

describe("when a photo was taken", () => {
  it("is the camera's clock with its offset, as one moment", () => {
    const moment = takenAt({
      DateTimeOriginal: "2026:10:19 08:12:33",
      OffsetTimeOriginal: "+02:00",
    });
    expect(moment?.toISOString()).toBe("2026-10-19T06:12:33.000Z");
  });

  it("is the camera's clock read on the phone's own when it says no offset", () => {
    const moment = takenAt({ DateTimeOriginal: "2026:10:19 08:12:33" });
    expect(moment?.getTime()).toBe(new Date(2026, 9, 19, 8, 12, 33).getTime());
  });

  it("falls back on the other clocks of the file, and is none when none says a moment", () => {
    expect(takenAt({ DateTime: "2026:10:18 17:00:00", OffsetTime: "-0300" })?.toISOString()).toBe(
      "2026-10-18T20:00:00.000Z",
    );
    expect(takenAt({ DateTimeOriginal: "    :  :     :  :  " })).toBeNull();
    expect(takenAt({})).toBeNull();
    expect(takenAt(null)).toBeNull();
  });

  it("of those chosen, is the first photo's that says one: a video says none", () => {
    expect(
      firstTakenAt([
        { type: "video", exif: { DateTimeOriginal: "2026:10:18 09:00:00" } },
        { type: "image", exif: {} },
        { type: "image", exif: { DateTimeOriginal: "2026:10:19 07:30:00", OffsetTime: "" } },
      ])?.getTime(),
    ).toBe(new Date(2026, 9, 19, 7, 30).getTime());
  });
});
