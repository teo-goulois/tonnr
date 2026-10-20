// Releases the app for phones of one stage, from what `main` holds on the remote, in a checkout
// of its own: decision 075.
//
//   pnpm run release:js <stage> [--platform ios|android] [--rollback] [--dry-run]
//
// `release:js` publishes `main`'s JavaScript as an update of each platform: `expo export`, then
// the runtime its fingerprint names, which a store build must have shipped, then the files under
// the key of their hash, the signed manifest, and last what points the runtime's apps at it.
// `--rollback` sends the apps of the runtime back to the JavaScript of their binary instead, and
// `--dry-run` builds and signs everything and writes nothing.
//
// The stage's values come from `packages/infra/.env.<stage>`, the account of Cloudflare from
// `packages/infra/.env`, and the R2 token of the updates' bucket and the path of the key that
// signs them from the root `.env`. None is printed, and no secret goes to the install or to
// Expo's tools, which run code that other people wrote: the key signs here, and the token
// writes from here. Expo receives nothing, and no `eas` command runs.
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  PLATFORMS,
  readShipped,
  shippedKey,
  updatesBucketName,
} from "../apps/updates/src/bucket.ts";
import { runtimeOf } from "../apps/updates/src/builds.ts";
import {
  inOrder,
  keyMatchesCertificate,
  newUpdateId,
  readExport,
  rollbackWrites,
  updateWrites,
  writeAll,
} from "../apps/updates/src/publish.ts";
import { r2Client } from "../apps/updates/src/r2.ts";
import { APP_SLUG } from "../packages/config/src/app.ts";
import {
  checkoutMain,
  fail,
  failKeeping,
  keptShell,
  licenceKey,
  readEnvFile,
  removeCheckout,
  root,
  run,
  start,
} from "./lib/checkout.mjs";

const HOST_NAME = /^([a-z0-9-]+\.)+[a-z]{2,}$/;
const KINDS = { js: ["--platform", "--rollback", "--dry-run"] };
const USAGE = "Usage: release js <stage> [--platform ios|android] [--rollback] [--dry-run]";

const [kind, stage, ...rest] = process.argv.slice(2);
if (!(kind in KINDS) || !/^[a-z0-9][a-z0-9_-]*$/.test(stage ?? "")) fail(USAGE);
const flags = new Set();
let only = null;
for (let at = 0; at < rest.length; at++) {
  const flag = rest[at];
  if (!KINDS[kind].includes(flag)) fail(USAGE);
  if (flag === "--platform") {
    only = rest[++at];
    if (!PLATFORMS.includes(only)) fail(USAGE);
  } else flags.add(flag);
}
const platforms = only ? [only] : [...PLATFORMS];

/** A path of the root `.env`, which may start at the home directory. */
const pathOf = (value) =>
  value?.startsWith("~/") ? path.join(os.homedir(), value.slice(2)) : value;

const settings = readEnvFile(path.join(root, ".env")) ?? {};
const access = readEnvFile(path.join(root, "packages", "infra", ".env")) ?? {};
const values = readEnvFile(path.join(root, "packages", "infra", `.env.${stage}`));
if (!values) {
  fail(`packages/infra/.env.${stage} is missing: the stage "${stage}" has no values here.`);
}

const faults = [];
if (!HOST_NAME.test(values.WEB_DOMAIN ?? "")) {
  faults.push(
    `WEB_DOMAIN in packages/infra/.env.${stage} is not a host name: the app's links name it`,
  );
}
if (!URL.canParse(values.VITE_SERVER_URL ?? "") || !values.VITE_SERVER_URL.startsWith("https:")) {
  faults.push(
    `VITE_SERVER_URL in packages/infra/.env.${stage} is not the HTTPS address of the API`,
  );
}
for (const name of ["UPDATES_DOMAIN", "UPDATES_FILES_DOMAIN"]) {
  if (!HOST_NAME.test(values[name] ?? "")) {
    faults.push(
      `${name} in packages/infra/.env.${stage} is not a host name: the stage has no updates`,
    );
  }
}
if (values.APPLE_TEAM_ID && !/^[A-Z0-9]{10}$/.test(values.APPLE_TEAM_ID)) {
  faults.push(
    `APPLE_TEAM_ID in packages/infra/.env.${stage} is not an Apple team, ten capitals and digits`,
  );
}
if (!/^[0-9a-f]{32}$/.test(access.CLOUDFLARE_ACCOUNT_ID ?? "")) {
  faults.push(
    "CLOUDFLARE_ACCOUNT_ID in packages/infra/.env is not an account id: R2's address names it",
  );
}
for (const name of ["UPDATES_R2_ACCESS_KEY_ID", "UPDATES_R2_SECRET_ACCESS_KEY"]) {
  if (!settings[name])
    faults.push(`${name} is not set in .env: the bucket of the updates takes its R2 token`);
}
const signingKey = pathOf(settings.UPDATES_SIGNING_KEY);
if (kind === "js" && !signingKey) {
  faults.push(
    "UPDATES_SIGNING_KEY is not set in .env: it names the file of the key that signs the updates",
  );
} else if (kind === "js" && !existsSync(signingKey)) {
  faults.push(
    "UPDATES_SIGNING_KEY in .env names no file: the key that signs the updates is not there",
  );
}
if (faults.length > 0) fail(`The app cannot be released to "${stage}":\n- ${faults.join("\n- ")}`);

const bucket = r2Client({
  accountId: access.CLOUDFLARE_ACCOUNT_ID,
  accessKeyId: settings.UPDATES_R2_ACCESS_KEY_ID,
  secretAccessKey: settings.UPDATES_R2_SECRET_ACCESS_KEY,
  bucket: updatesBucketName(APP_SLUG, stage),
});

/**
 * What the app's config and Expo's tools are given, the same for a store build and a
 * publication, since the fingerprint hashes the config they write: the stage's public values,
 * and Expo's telemetry and its servers turned off.
 */
const appValues = {
  NODE_ENV: "production",
  EXPO_PUBLIC_SERVER_URL: values.VITE_SERVER_URL,
  EXPO_PUBLIC_SITE_URL: `https://${values.WEB_DOMAIN}`,
  UPDATES_URL: `https://${values.UPDATES_DOMAIN}`,
  ...(values.APPLE_TEAM_ID && { APPLE_TEAM_ID: values.APPLE_TEAM_ID }),
  EXPO_NO_TELEMETRY: "1",
  EXPO_OFFLINE: "1",
};

const licence = licenceKey();
const { checkout, commit, summary } = await checkoutMain(`release-${kind}`);
console.log(`Releasing ${kind === "js" ? "the JavaScript" : kind} of the app to "${stage}"`);
console.log(`from ${summary}`);
console.log(`in ${checkout}\n`);

const native = path.join(checkout, "apps", "native");
const tool = (name) => path.join(native, "node_modules", ".bin", name);
const shell = keptShell();
const appEnv = { ...shell, ...appValues };

/** Stops a release that built nothing worth keeping, without its checkout. */
async function refuse(message) {
  await removeCheckout(checkout, "The release was refused");
  fail(message);
}

/** Runs a tool in the app and keeps what it printed, or stops the release with what it said. */
async function output(command, args) {
  const {
    ok,
    output: printed,
    errors,
  } = await start(command, args, {
    keep: true,
    cwd: native,
    env: appEnv,
  });
  if (!ok) {
    console.error(errors);
    failKeeping(checkout, "The release");
  }
  return printed;
}

/** The runtime that a binary of this commit carries, and a publication of it names. */
const runtimeFor = async (platform) =>
  runtimeOf(await output(tool("expo-updates"), ["runtimeversion:resolve", "--platform", platform]));

const installed = await run("pnpm", ["install", "--frozen-lockfile"], {
  cwd: checkout,
  env: { ...shell, NUCLEO_LICENSE_KEY: licence },
});
if (!installed) failKeeping(checkout, "The install");

// The key signs for the certificate the binaries of `main` carry, or for nothing.
const privateKey = readFileSync(signingKey, "utf8");
const certificate = readFileSync(path.join(native, "certs", "certificate.pem"), "utf8");
if (!keyMatchesCertificate(privateKey, certificate)) {
  await refuse(
    "The key UPDATES_SIGNING_KEY names does not sign for apps/native/certs/certificate.pem: the " +
      "binaries would refuse what it signs.",
  );
}

// Each platform's runtime, which a store build must have shipped: an update built for native
// code that no binary has would reach none, or crash those it reached.
const runtimes = {};
const unshipped = [];
for (const platform of platforms) {
  runtimes[platform] = await runtimeFor(platform);
  const shipped = await bucket.get(shippedKey(platform, runtimes[platform]));
  if (!shipped || !readShipped(new TextDecoder().decode(shipped))) unshipped.push(platform);
}
if (unshipped.length > 0) {
  await refuse(
    unshipped
      .map(
        (platform) =>
          `No store build of ${platform} shipped the runtime ${runtimes[platform]}: native code ` +
          `changed since the last one, and a store build is needed, \`pnpm run release:${platform} ${stage}\`.`,
      )
      .join("\n") +
      (unshipped.length < platforms.length
        ? `\n\`--platform ${platforms.find((platform) => !unshipped.includes(platform))}\` publishes the other alone.`
        : ""),
  );
}

let writes;
const now = new Date().toISOString();
if (flags.has("--rollback")) {
  writes = inOrder(
    platforms.map((platform) =>
      rollbackWrites(platform, runtimes[platform], newUpdateId(), now, privateKey),
    ),
  );
  for (const platform of platforms) {
    console.log(
      `${platform}: the apps of ${runtimes[platform]} go back to their binary's JavaScript`,
    );
  }
} else {
  // The bundle is compiled to Hermes's bytecode by the React Native of the lockfile, the one the
  // binary's Hermes reads: the export never skips it.
  const exported = path.join(native, "dist");
  await output(tool("expo"), [
    "export",
    ...platforms.flatMap((platform) => ["--platform", platform]),
    "--output-dir",
    exported,
  ]);
  const expoClient = JSON.parse(
    await output(tool("expo"), ["config", "--type", "public", "--json"]),
  );
  const published = platforms.map((platform) => {
    const { manifest, writes: platformWrites } = updateWrites(
      platform,
      {
        id: newUpdateId(),
        createdAt: now,
        runtime: runtimes[platform],
        exported: readExport(exported, platform),
        filesOrigin: `https://${values.UPDATES_FILES_DOMAIN}`,
        expoClient,
        commit,
      },
      privateKey,
    );
    console.log(
      `${platform}: update ${manifest.id} for ${runtimes[platform]}, ` +
        `${manifest.assets.length + 1} files`,
    );
    return platformWrites;
  });
  writes = inOrder(published);
}

if (flags.has("--dry-run")) {
  console.log(`\nA dry run: ${writes.length} objects would be written, and none was.`);
} else {
  try {
    const { sent, kept } = await writeAll(bucket, writes);
    console.log(
      `\nPublished: ${sent} objects written, and ${kept} files the bucket held already. ` +
        "The apps of each runtime take it at their second start.",
    );
  } catch (error) {
    // Nothing points at what was written before the fault: the apps see none of it.
    console.error(error.message);
    failKeeping(checkout, "The publication");
  }
}
await removeCheckout(checkout, "The release is done");
