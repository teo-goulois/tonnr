import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { probeVideo, renderVideo, VideoRefused } from "./video";

// ffmpeg is a program of the machine: the worker's image installs it, and so does CI's runner.
const hasFfmpeg = (() => {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!hasFfmpeg)("renderVideo", () => {
  let folder: string;
  let phone: string;

  beforeAll(async () => {
    folder = await mkdtemp(join(tmpdir(), "video-test-"));
    phone = join(folder, "phone.mov");
    // Three seconds of a phone held upright, which films across and says so, at 60 images a
    // second, with sound, and the place it was filmed.
    const across = join(folder, "across.mov");
    execFileSync("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=640x360:rate=60:duration=3",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=3",
      "-c:v",
      "libx264",
      "-c:a",
      "aac",
      "-metadata",
      "location=+43.4832-001.5586/",
      "-metadata",
      "creation_time=2026-10-10T09:12:00Z",
      "-y",
      across,
    ]);
    execFileSync("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-display_rotation",
      "90",
      "-i",
      across,
      "-c",
      "copy",
      "-map_metadata",
      "0",
      "-y",
      phone,
    ]);
  });
  afterAll(() => rm(folder, { recursive: true, force: true }));

  it("reads where and when a phone says it filmed, and how it is seen", async () => {
    const probed = await probeVideo(phone);
    expect(probed.durationSeconds).toBeCloseTo(3, 0);
    expect(probed.location).toBe("+43.4832-001.5586/");
    expect(probed.creationTime).toMatch(/^2026-10-10T09:12:00/);
    expect([probed.width, probed.height]).toEqual([360, 640]);
    expect(probed.hasAudio).toBe(true);
  });

  it("makes an upright H.264 at 30 images a second that says nothing of where it was filmed", async () => {
    const out = await mkdtemp(join(folder, "out-"));
    const made = await renderVideo(phone, out, { mostSeconds: 60, audio: false });
    expect([made.video.width, made.video.height]).toEqual([360, 640]);
    expect(made.poster.contentType).toBe("image/webp");
    const probed = JSON.parse(
      execFileSync("ffprobe", [
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        made.video.path,
      ]).toString(),
    ) as {
      format: { tags?: Record<string, string> };
      streams: { codec_type: string; codec_name: string; r_frame_rate: string }[];
    };
    expect(probed.streams.map((stream) => stream.codec_type)).toEqual(["video"]);
    expect(probed.streams[0]?.codec_name).toBe("h264");
    expect(probed.streams[0]?.r_frame_rate).toBe("30/1");
    const tags = Object.keys(probed.format.tags ?? {}).map((key) => key.toLowerCase());
    expect(tags).not.toContain("location");
    expect(tags).not.toContain("creation_time");
  });

  it("refuses a video longer than it may be", async () => {
    const out = await mkdtemp(join(folder, "long-"));
    await expect(renderVideo(phone, out, { mostSeconds: 2, audio: true })).rejects.toThrow(
      VideoRefused,
    );
  });

  it("refuses a list of other files that says it is a video", async () => {
    const playlist = join(folder, "trick.mp4");
    await writeFile(playlist, "#EXTM3U\n#EXTINF:1,\nfile:///etc/passwd\n");
    await expect(probeVideo(playlist)).rejects.toThrow(VideoRefused);
  });
});
