// What the release commands read of the tools they run, as functions that run nothing, so that a
// test reads them: decision 075.
import type { Platform, Shipped } from "./bucket.ts";

/** The highest version code Google Play takes. */
const HIGHEST_BUILD = 2_100_000_000;

/**
 * The build number of a store build, the same on both platforms: the count of commits of `main`
 * up to the one built, which `git rev-list --count` prints. It grows with `main`, says which
 * commit a binary was built from, and a store takes each once.
 */
export function buildNumberOf(count: string): number {
  const build = Number(count.trim());
  if (!/^\d+$/.test(count.trim()) || build < 1 || build > HIGHEST_BUILD) {
    throw new Error(`The count of commits is no build number: ${count.trim().slice(0, 40)}`);
  }
  return build;
}

/**
 * Why a store build must not go out, or null: the runtime its binary carries is not the one a
 * publication of the same commit would name. Such a binary would take no update, and no one
 * would see it.
 */
export function runtimeDrift(platform: Platform, binary: string, published: string) {
  const carried = binary.trim();
  if (carried === published) return null;
  return (
    `The ${platform} binary carries the runtime ${carried || "(none)"}, and a publication of the ` +
    `same commit would name ${published}: what the build installed or what its config plugins ` +
    "wrote differs from what pnpm run release:js reads. Nothing was uploaded."
  );
}

/** What a store build writes in the bucket once its upload succeeded: the runtime it shipped. */
export const shippedOf = (shipped: Shipped) => new TextEncoder().encode(JSON.stringify(shipped));

const xml = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

/** How the export signs: the certificate on this Mac by its SHA-1, and each profile by its UUID. */
export type ExportSigning = { certificate: string; profiles: Record<string, string> };

/**
 * The options `xcodebuild -exportArchive` exports an archive with, for App Store Connect, signed
 * by hand with the team's distribution certificate on this Mac and the profiles a release made
 * for it, so that xcodebuild never signs through Apple's cloud. The build number is the one the
 * app's config gave it.
 */
export function exportOptionsOf(teamId: string, signing: ExportSigning): string {
  const profiles = Object.entries(signing.profiles).flatMap(([identifier, uuid]) => [
    `    <key>${xml(identifier)}</key>`,
    `    <string>${xml(uuid)}</string>`,
  ]);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    "<dict>",
    "  <key>method</key>",
    "  <string>app-store-connect</string>",
    "  <key>destination</key>",
    "  <string>export</string>",
    "  <key>teamID</key>",
    `  <string>${xml(teamId)}</string>`,
    "  <key>signingStyle</key>",
    "  <string>manual</string>",
    "  <key>signingCertificate</key>",
    `  <string>${xml(signing.certificate)}</string>`,
    "  <key>provisioningProfiles</key>",
    "  <dict>",
    ...profiles,
    "  </dict>",
    "  <key>manageAppVersionAndBuildNumber</key>",
    "  <false/>",
    "  <key>uploadSymbols</key>",
    "  <true/>",
    "</dict>",
    "</plist>",
    "",
  ].join("\n");
}

/** The Xcode workspace `expo prebuild` wrote, from what `ios/` holds, which names its scheme too. */
export function workspaceOf(entries: string[]): string {
  const workspaces = entries.filter((entry) => entry.endsWith(".xcworkspace"));
  if (workspaces.length !== 1) {
    throw new Error(`ios/ holds ${workspaces.length} workspaces where expo prebuild writes one`);
  }
  return (workspaces[0] as string).slice(0, -".xcworkspace".length);
}

/**
 * The runtime that `expo-updates runtimeversion:resolve` names, from what it prints: the
 * binary's fingerprint, which a publication goes to and a store build carries.
 */
export function runtimeOf(output: string): string {
  // It prints its JSON on the last line, after whatever a config plugin said.
  const line = output.trim().split("\n").at(-1) ?? "";
  let runtime: unknown;
  try {
    runtime = (JSON.parse(line) as { runtimeVersion?: unknown }).runtimeVersion;
  } catch {
    throw new Error(`expo-updates named no runtime: ${line.slice(0, 200)}`);
  }
  if (typeof runtime !== "string" || !/^[0-9a-f]{40}$/.test(runtime)) {
    throw new Error(
      `expo-updates named ${JSON.stringify(runtime)}, which is no fingerprint: the app's config ` +
        "asks for the fingerprint policy only when it names the address of the updates",
    );
  }
  return runtime;
}
