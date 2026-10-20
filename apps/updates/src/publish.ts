// What `pnpm run release:js <stage>` makes of an export of the app before it writes the bucket:
// each platform's manifest, signed with the key of the updates, and the writes in the order an
// app never reads a manifest whose files are missing. Decision 075.
import { X509Certificate, createHash, createSign, randomUUID, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { UPDATES_KEY_ID, UPDATES_SIGNATURE_ALGORITHM } from "@repo/config/updates";

import {
  type Latest,
  type Platform,
  SIGNATURE_METADATA,
  fileKey,
  latestKey,
  signedKey,
} from "./bucket.ts";

/** A file never changes at its address, so it is kept a year in every cache. */
export const FILE_CACHE = "public, max-age=31536000, immutable";
/** What says which publication is the latest is read by the Worker alone, never from a cache. */
const POINTER_CACHE = "no-store";

/** One object to write into the bucket, in the order of a publication. */
export type Write = {
  key: string;
  body: Uint8Array;
  contentType: string;
  cacheControl: string;
  metadata?: Record<string, string>;
  /** A file of an update, the same bytes at its key forever: one already there is left as it is. */
  immutable?: boolean;
};

/** The JavaScript bundle of a platform and the files it draws, as `expo export` wrote them. */
export type Exported = {
  bundle: Uint8Array;
  assets: { ext: string; bytes: Uint8Array }[];
};

/** What `expo export` says of what it wrote, in `metadata.json`. */
export type ExportMetadata = {
  fileMetadata: Partial<
    Record<Platform, { bundle: string; assets: { path: string; ext: string }[] }>
  >;
};

/** A platform's bundle and files, read from the directory `expo export` wrote. */
export function readExport(directory: string, platform: Platform): Exported {
  const metadata = JSON.parse(
    readFileSync(join(directory, "metadata.json"), "utf8"),
  ) as ExportMetadata;
  const files = metadata.fileMetadata[platform];
  if (!files) throw new Error(`The export holds nothing for ${platform}`);
  const read = (path: string) => new Uint8Array(readFileSync(join(directory, path)));
  return {
    bundle: read(files.bundle),
    assets: files.assets.map((asset) => ({ ext: asset.ext, bytes: read(asset.path) })),
  };
}

const TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  heic: "image/heic",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  ttf: "font/ttf",
  otf: "font/otf",
  woff: "font/woff",
  woff2: "font/woff2",
  json: "application/json",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  aac: "audio/aac",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  html: "text/html",
  txt: "text/plain",
};

/** The type a file is served with, from its extension. */
export const contentTypeOf = (ext: string) =>
  TYPES[ext.toLowerCase()] ?? "application/octet-stream";

/** A file's place in a manifest, and how it is written: under the key of its hash. */
function fileOf(bytes: Uint8Array, ext: string | null, filesOrigin: string) {
  const hex = createHash("sha256").update(bytes).digest("hex");
  const contentType = ext === null ? "application/javascript" : contentTypeOf(ext);
  return {
    asset: {
      // The client checks each file against this hash, written as base64url without padding.
      hash: createHash("sha256").update(bytes).digest("base64url"),
      // The client keeps a file under its key, and the app finds a picture by the MD5 of its
      // bytes, which Metro names it by: expo-asset looks up `localAssets[fileHash]`, which
      // expo-updates fills from each asset's key and, for the binary's own, from their MD5. A key
      // of another hash would leave every picture an update adds or changes blank, and make the
      // client download again the pictures it holds already.
      key: createHash("md5").update(bytes).digest("hex"),
      contentType,
      fileExtension: `.${ext ?? "bundle"}`,
      url: new URL(fileKey(hex), filesOrigin).toString(),
    },
    write: {
      key: fileKey(hex),
      body: bytes,
      contentType,
      cacheControl: FILE_CACHE,
      immutable: true,
    } satisfies Write,
  };
}

export type ManifestInput = {
  id: string;
  createdAt: string;
  runtime: string;
  exported: Exported;
  /** The bucket's own address, such as https://bundles.example.org. */
  filesOrigin: string;
  /** The app's public config, which the app reads as its own while it runs the update. */
  expoClient: Record<string, unknown>;
  commit: string;
};

/** The manifest of an update of one platform, and the files it names. */
export function manifestOf(input: ManifestInput) {
  const launch = fileOf(input.exported.bundle, null, input.filesOrigin);
  const assets = input.exported.assets.map((asset) =>
    fileOf(asset.bytes, asset.ext, input.filesOrigin),
  );
  return {
    manifest: {
      id: input.id,
      createdAt: input.createdAt,
      runtimeVersion: input.runtime,
      launchAsset: launch.asset,
      assets: assets.map((asset) => asset.asset),
      metadata: {},
      extra: { expoClient: input.expoClient, commit: input.commit },
    },
    files: [launch.write, ...assets.map((asset) => asset.write)],
  };
}

/** The `expo-signature` of bytes: RSA with SHA-256, under the key's id. */
export function signatureOf(body: Uint8Array, privateKey: string): string {
  const sig = createSign("RSA-SHA256").update(body).sign(privateKey, "base64");
  return `sig="${sig}", keyid="${UPDATES_KEY_ID}", alg="${UPDATES_SIGNATURE_ALGORITHM}"`;
}

/** Whether a key signs what the certificate of the binaries checks. */
export function keyMatchesCertificate(privateKey: string, certificate: string): boolean {
  const probe = new TextEncoder().encode("Does this key sign for the certificate?");
  const sig = createSign("RSA-SHA256").update(probe).sign(privateKey);
  return verify("RSA-SHA256", probe, new X509Certificate(certificate).publicKey, sig);
}

const json = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

const signedWrite = (key: string, body: Uint8Array, privateKey: string): Write => ({
  key,
  body,
  contentType: "application/json",
  cacheControl: POINTER_CACHE,
  metadata: { [SIGNATURE_METADATA]: signatureOf(body, privateKey) },
});

const pointer = (platform: Platform, runtime: string, latest: Latest): Write => ({
  key: latestKey(platform, runtime),
  body: json(latest),
  contentType: "application/json",
  cacheControl: POINTER_CACHE,
});

/** A new id for a publication, which an app sends back once it runs it. */
export const newUpdateId = () => randomUUID();

/**
 * The writes of an update of one platform: its files, then its signed manifest, and last what
 * points the runtime's apps at it.
 */
export function updateWrites(
  platform: Platform,
  input: ManifestInput,
  privateKey: string,
): { manifest: ReturnType<typeof manifestOf>["manifest"]; writes: Write[] } {
  const { manifest, files } = manifestOf(input);
  return {
    manifest,
    writes: [
      ...files,
      signedWrite(signedKey(platform, input.runtime, input.id), json(manifest), privateKey),
      pointer(platform, input.runtime, { kind: "update", id: input.id }),
    ],
  };
}

/**
 * The writes that send a runtime's apps back to the JavaScript of their binary: the signed
 * directive, dated now, which an app follows when it runs an update older than it.
 */
export function rollbackWrites(
  platform: Platform,
  runtime: string,
  id: string,
  commitTime: string,
  privateKey: string,
): Write[] {
  const directive = json({ type: "rollBackToEmbedded", parameters: { commitTime } });
  return [
    signedWrite(signedKey(platform, runtime, id), directive, privateKey),
    pointer(platform, runtime, { kind: "rollBackToEmbedded", id }),
  ];
}

/** What writes the bucket: R2's S3 API, or what a test stands for it. */
export type Writer = {
  has(key: string): Promise<boolean>;
  put(
    key: string,
    body: Uint8Array,
    written: Pick<Write, "contentType" | "cacheControl" | "metadata">,
  ): Promise<void>;
};

/**
 * Writes a publication in its order, one object after the other, and stops at the first that
 * fails: what was written before points at nothing yet. A file already there is not sent again.
 */
export async function writeAll(writer: Writer, writes: Write[]) {
  let sent = 0;
  let kept = 0;
  for (const write of writes) {
    if (write.immutable && (await writer.has(write.key))) {
      kept++;
      continue;
    }
    await writer.put(write.key, write.body, write);
    sent++;
  }
  return { sent, kept };
}

/** The writes of several platforms, each file once, the files of all of them first. */
export function inOrder(writes: Write[][]): Write[] {
  const files = new Map<string, Write>();
  const rest: Write[] = [];
  for (const write of writes.flat()) {
    if (write.immutable) files.set(write.key, write);
    else rest.push(write);
  }
  return [...files.values(), ...rest];
}
