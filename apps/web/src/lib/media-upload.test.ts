import { describe, expect, it } from "vitest";

import { judgeFile, typeOfFile } from "./media-upload";

const MB = 1024 * 1024;

describe("the files a session takes", () => {
  it("reads a type from the name when the browser gives none, as for a HEIF on a computer", () => {
    expect(typeOfFile({ type: "", name: "IMG_2041.HEIC" })).toBe("image/heic");
    expect(typeOfFile({ type: "", name: "clip.MOV" })).toBe("video/quicktime");
    expect(typeOfFile({ type: "image/JPEG", name: "a.jpg" })).toBe("image/jpeg");
    expect(typeOfFile({ type: "", name: "notes" })).toBe("");
  });

  it("takes a phone's photos and videos, and refuses another file or one too big", () => {
    expect(judgeFile({ type: "image/heic", name: "a.heic", size: 3 * MB })).toBe("photo");
    expect(judgeFile({ type: "video/quicktime", name: "a.mov", size: 900 * MB })).toBe("video");
    expect(judgeFile({ type: "image/svg+xml", name: "a.svg", size: 1000 })).toBe("type");
    expect(judgeFile({ type: "application/pdf", name: "a.pdf", size: 1000 })).toBe("type");
    expect(judgeFile({ type: "image/jpeg", name: "a.jpg", size: 41 * MB })).toBe("size");
    expect(judgeFile({ type: "video/mp4", name: "a.mp4", size: 1025 * MB })).toBe("size");
  });
});
