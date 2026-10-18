import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import sharp from "sharp";

import type { Rendition } from "./photo";

// What the worker makes of a video that was sent: an MP4 that every browser plays, of the size a
// phone's screen shows, with a picture of it before it plays. ffmpeg does it, in a process of its
// own that reads one file and nothing else, and keeps nothing of what the file said: no place,
// no time, no device. Decision 066.

/** The containers a video is read from: a phone's and a browser's, and nothing that points elsewhere. */
const FORMATS = "mov,mp4,m4a,3gp,3g2,mj2,matroska,webm";
/** The decoders a video is read with: a phone's and a browser's codecs. */
const DECODERS = [
  "h264",
  "hevc",
  "vp8",
  "vp9",
  "av1",
  "libdav1d",
  "mpeg4",
  "aac",
  "mp3",
  "opus",
  "vorbis",
  "alac",
  "flac",
  "pcm_s16le",
  "pcm_s24le",
  "pcm_f32le",
].join(",");
// What every reading of a file is held to: it opens that file alone, of these containers, with
// these decoders. Neither tool is given a terminal to ask.
const SAFE_INPUT = [
  "-protocol_whitelist",
  "file",
  "-format_whitelist",
  FORMATS,
  "-codec_whitelist",
  DECODERS,
];

// The longest side of the video that is played, and the shortest: what a phone's screen shows.
const LONG_EDGE = 1920;
const POSTER_EDGE = 1280;
const THUMB_EDGE = 480;

/** Why a video could not be made. */
export class VideoRefused extends Error {
  constructor(readonly reason: "unreadable" | "too_long") {
    super(`The video is ${reason}`);
  }
}

/** Where ffmpeg and ffprobe are, and how long and how hard they may work. */
export type Tools = {
  ffmpeg: string;
  ffprobe: string;
  // The threads an encoding takes: the worker shares its machine with the instance's other jobs.
  threads: number;
};

export const DEFAULT_TOOLS: Tools = { ffmpeg: "ffmpeg", ffprobe: "ffprobe", threads: 2 };

/**
 * Runs a tool and answers what it wrote. It is given no environment but where programs are, so
 * that it reads none of the worker's settings, runs at a lower priority than the worker, and is
 * killed with what it started when the time runs out or the job is stopped.
 */
function run(command: string, args: string[], ms: number, signal?: AbortSignal) {
  return new Promise<string>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error("stopped"));
      return;
    }
    const child = spawn("nice", ["-n", "10", command, ...args], {
      env: { PATH: process.env.PATH ?? "/usr/bin:/bin" },
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk: Buffer) => {
      if (out.length < 1_000_000) out += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (err.length < 10_000) err += chunk.toString();
    });
    const kill = () => {
      try {
        if (child.pid) process.kill(-child.pid, "SIGKILL");
      } catch {
        // Already gone.
      }
    };
    const timer = setTimeout(kill, ms);
    const stop = () => kill();
    signal?.addEventListener("abort", stop, { once: true });
    child.on("error", (error) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", stop);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", stop);
      if (code === 0) resolve(out);
      // What the tool said is not kept: it can name the file and what it held.
      else reject(new ToolFailed(command, code));
    });
  });
}

/** A tool that ended in failure, or was stopped. */
export class ToolFailed extends Error {
  constructor(
    readonly tool: string,
    readonly code: number | null,
  ) {
    super(`${tool} ended with ${code ?? "a signal"}`);
  }
}

/** What a video file says of itself, as ffprobe reads it. */
export type Probed = {
  durationSeconds: number;
  width: number;
  height: number;
  hasAudio: boolean;
  // Recorded in HDR, which is turned into the colors every screen shows.
  hdr: boolean;
  // Where and when the file says it was filmed, as the camera wrote it. Null when it says not.
  location: string | null;
  creationTime: string | null;
};

type ProbeAnswer = {
  format?: { duration?: string; tags?: Record<string, string> };
  streams?: {
    codec_type?: string;
    width?: number;
    height?: number;
    color_transfer?: string;
    side_data_list?: { rotation?: number }[];
    tags?: Record<string, string>;
  }[];
};

/** Reads what a video file says of itself. Throws `VideoRefused` for a file that is no video. */
export async function probeVideo(
  path: string,
  tools: Tools = DEFAULT_TOOLS,
  signal?: AbortSignal,
): Promise<Probed> {
  const answer = await run(
    tools.ffprobe,
    [...SAFE_INPUT, "-v", "error", "-print_format", "json", "-show_format", "-show_streams", path],
    30_000,
    signal,
  ).catch((error: unknown) => {
    if (error instanceof ToolFailed) throw new VideoRefused("unreadable");
    throw error;
  });
  let read: ProbeAnswer;
  try {
    read = JSON.parse(answer) as ProbeAnswer;
  } catch {
    throw new VideoRefused("unreadable");
  }
  const video = read.streams?.find((stream) => stream.codec_type === "video");
  const durationSeconds = Number(read.format?.duration);
  if (!video?.width || !video.height || !Number.isFinite(durationSeconds)) {
    throw new VideoRefused("unreadable");
  }
  const rotation = video.side_data_list?.find((side) => side.rotation !== undefined)?.rotation ?? 0;
  const quarter = Math.abs(rotation) % 180 === 90;
  const tags = { ...read.format?.tags, ...video.tags };
  const tag = (...names: string[]) => {
    for (const name of names) {
      const found = Object.entries(tags).find(([key]) => key.toLowerCase() === name)?.[1];
      if (found) return found;
    }
    return null;
  };
  return {
    durationSeconds,
    // As it is seen: a phone held upright films across, and says so.
    width: quarter ? video.height : video.width,
    height: quarter ? video.width : video.height,
    hasAudio: read.streams?.some((stream) => stream.codec_type === "audio") ?? false,
    hdr: video.color_transfer === "smpte2084" || video.color_transfer === "arib-std-b67",
    location: tag("com.apple.quicktime.location.iso6709", "location"),
    creationTime: tag("com.apple.quicktime.creationdate", "creation_time"),
  };
}

let zscale: Promise<boolean> | undefined;

/** Whether this ffmpeg can turn HDR into the colors every screen shows: Debian's can. */
function canToneMap(tools: Tools) {
  zscale ??= run(tools.ffmpeg, ["-hide_banner", "-filters"], 10_000)
    .then((filters) => /\bzscale\b/.test(filters))
    .catch(() => false);
  return zscale;
}

/** What `renderVideo` writes, as files of the work folder, and what each holds. */
export type RenderedVideo = {
  video: { path: string; width: number; height: number; durationMs: number };
  poster: Rendition;
  thumb: Rendition;
  // What the file said of itself, read before the copy that says nothing of it.
  probed: Probed;
  // Images of the start, the middle and the end, for the analysis of a report. Kept nowhere.
  frames: Buffer[];
};

/**
 * Makes a video of what was sent: H.264 at most 1080p and 30 images a second, which every
 * browser and phone plays, with its sound unless `audio` is false, and a poster. It refuses one
 * longer than `mostSeconds`. The files are written in `folder`, which the caller removes.
 */
export async function renderVideo(
  input: string,
  folder: string,
  options: {
    mostSeconds: number;
    audio: boolean;
    // Whether to take three images of it for the analysis of a report.
    frames?: boolean;
    tools?: Tools;
    signal?: AbortSignal;
  },
): Promise<RenderedVideo> {
  const tools = options.tools ?? DEFAULT_TOOLS;
  const probed = await probeVideo(input, tools, options.signal);
  if (probed.durationSeconds > options.mostSeconds + 0.5) throw new VideoRefused("too_long");

  const filters = [
    // HDR, as an iPhone films it, made into what a screen shows without it.
    ...(probed.hdr && (await canToneMap(tools))
      ? [
          "zscale=t=linear:npl=100",
          "format=gbrpf32le",
          "zscale=p=bt709",
          "tonemap=tonemap=hable:desat=0",
          "zscale=t=bt709:m=bt709:r=tv",
        ]
      : []),
    `scale=w='min(iw,${LONG_EDGE})':h='min(ih,${LONG_EDGE})':force_original_aspect_ratio=decrease:force_divisible_by=2`,
    "format=yuv420p",
  ].join(",");
  const output = join(folder, "video.mp4");
  await run(
    tools.ffmpeg,
    [
      "-nostdin",
      ...SAFE_INPUT,
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      input,
      "-map",
      "0:v:0",
      ...(options.audio && probed.hasAudio ? ["-map", "0:a:0"] : []),
      // Nothing of what the file said goes on: no place, no time, no device, no chapter.
      "-map_metadata",
      "-1",
      "-map_chapters",
      "-1",
      "-sn",
      "-dn",
      "-vf",
      filters,
      "-fpsmax",
      "30",
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "26",
      "-maxrate",
      "6M",
      "-bufsize",
      "12M",
      "-profile:v",
      "high",
      "-threads",
      String(tools.threads),
      ...(options.audio && probed.hasAudio ? ["-c:a", "aac", "-b:a", "128k", "-ac", "2"] : ["-an"]),
      // Played as it arrives.
      "-movflags",
      "+faststart",
      "-y",
      output,
    ],
    // A minute of a phone's 4K takes a few minutes of two threads.
    15 * 60_000,
    options.signal,
  );

  // The poster is an image of the start, a second in, or of the middle of a shorter video.
  const still = join(folder, "still.png");
  await run(
    tools.ffmpeg,
    [
      "-nostdin",
      "-hide_banner",
      "-loglevel",
      "error",
      "-ss",
      String(Math.min(1, probed.durationSeconds / 2)),
      "-i",
      output,
      "-frames:v",
      "1",
      "-y",
      still,
    ],
    60_000,
    options.signal,
  );
  const frame = await readFile(still);
  // Three images across the video, as the analysis reads them.
  const frames: Buffer[] = [];
  if (options.frames) {
    for (const [index, share] of [0.2, 0.5, 0.8].entries()) {
      const path = join(folder, `frame-${index}.jpg`);
      await run(
        tools.ffmpeg,
        [
          "-nostdin",
          "-hide_banner",
          "-loglevel",
          "error",
          "-ss",
          String(probed.durationSeconds * share),
          "-i",
          output,
          "-frames:v",
          "1",
          "-vf",
          "scale=w='min(iw,512)':h='min(ih,512)':force_original_aspect_ratio=decrease",
          "-y",
          path,
        ],
        60_000,
        options.signal,
      );
      frames.push(await readFile(path));
    }
  }
  const meta = await sharp(frame).metadata();
  const posterOf = async (edge: number, fit: "inside" | "outside", quality: number) => {
    const { data, info } = await sharp(frame)
      .resize({ width: edge, height: edge, fit, withoutEnlargement: true })
      .webp({ quality })
      .toBuffer({ resolveWithObject: true });
    return { body: data, contentType: "image/webp", width: info.width, height: info.height };
  };
  return {
    video: {
      path: output,
      width: meta.width ?? probed.width,
      height: meta.height ?? probed.height,
      durationMs: Math.round(probed.durationSeconds * 1000),
    },
    poster: await posterOf(POSTER_EDGE, "inside", 78),
    thumb: await posterOf(THUMB_EDGE, "outside", 72),
    probed,
    frames,
  };
}
