// What the bucket of the updates holds, and where: the Worker reads it, `pnpm run release:js`
// writes the publications and the store builds write their runtimes. Decision 075.
//
// files/<sha256>                               a file of an update, at the bucket's own domain
// updates/<platform>/<runtime>/<id>.json       a manifest or a directive, its signature beside it
// directives/noUpdateAvailable.json            the directive that says nothing is new, signed once
// runtimes/<platform>/<runtime>/latest.json    which publication the runtime's apps get
// runtimes/<platform>/<runtime>/shipped.json   the store build that shipped the runtime
//
// This module imports nothing, so that the stack, the Worker and the release commands all read it.

export const PLATFORMS = ["ios", "android"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const isPlatform = (value: unknown): value is Platform =>
  PLATFORMS.includes(value as Platform);

/** A runtime goes into the bucket's keys: a fingerprint is 40 hexadecimal digits. */
export const isRuntime = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9A-Za-z][0-9A-Za-z._-]{0,127}$/.test(value);

const UPDATE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The id of an update, as the app sends it back: a UUID in small letters. */
export const isUpdateId = (value: unknown): value is string =>
  typeof value === "string" && UPDATE_ID.test(value);

/** The bucket of a stage's updates, named after the product's slug and the stage. */
export const updatesBucketName = (slug: string, stage: string) =>
  `${slug}-${stage.replaceAll("_", "-")}-updates`;

/** The metadata of a signed object that holds its signature, the `expo-signature` it is served with. */
export const SIGNATURE_METADATA = "signature";

export const fileKey = (sha256Hex: string) => `files/${sha256Hex}`;

export const signedKey = (platform: Platform, runtime: string, id: string) =>
  `updates/${platform}/${runtime}/${id}.json`;

export const NO_UPDATE_KEY = "directives/noUpdateAvailable.json";

export const latestKey = (platform: Platform, runtime: string) =>
  `runtimes/${platform}/${runtime}/latest.json`;

export const shippedKey = (platform: Platform, runtime: string) =>
  `runtimes/${platform}/${runtime}/shipped.json`;

/**
 * What the apps of a runtime get: the manifest of an update, or the directive that sends them
 * back to the JavaScript of their binary. Either is the signed object of its id.
 */
export type Latest = { kind: "update" | "rollBackToEmbedded"; id: string };

export function readLatest(text: string): Latest | null {
  try {
    const value = JSON.parse(text) as Partial<Latest>;
    if ((value.kind === "update" || value.kind === "rollBackToEmbedded") && isUpdateId(value.id)) {
      return { kind: value.kind, id: value.id };
    }
  } catch {
    // Read as nothing published below.
  }
  return null;
}

/** The store build that shipped a runtime, once its upload succeeded. */
export type Shipped = { build: number; commit: string; version: string; shippedAt: string };

export function readShipped(text: string): Shipped | null {
  try {
    const value = JSON.parse(text) as Partial<Shipped>;
    if (
      Number.isInteger(value.build) &&
      typeof value.commit === "string" &&
      /^[0-9a-f]{40}$/.test(value.commit) &&
      typeof value.version === "string" &&
      typeof value.shippedAt === "string"
    ) {
      return value as Shipped;
    }
  } catch {
    // Read as no store build below.
  }
  return null;
}
