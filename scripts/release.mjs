// Releases the app for phones of one stage, from what `main` holds on the remote, in a checkout
// of its own: decision 075.
//
//   pnpm run release:js <stage> [--platform ios|android] [--rollback] [--dry-run]
//   pnpm run release:ios <stage>
//   pnpm run release:android <stage> [--track <name>] [--by-hand]
//
// `release:js` publishes `main`'s JavaScript as an update of each platform: `expo export`, then
// the runtime its fingerprint names, which a store build must have shipped, then the files under
// the key of their hash, the signed manifest, and last what points the runtime's apps at it.
// `--rollback` sends the apps of the runtime back to the JavaScript of their binary instead, and
// `--dry-run` builds and signs everything and writes nothing.
//
// `release:ios` and `release:android` make a store build: `expo prebuild --clean`, then Xcode or
// Gradle, signed with the keys of this Mac, then the upload to TestFlight or to a test track of
// Google Play, from which a person promotes it. The build number is the count of commits of
// `main` up to the one built. Before it uploads, a build checks that the runtime its binary
// carries is the one a publication of the same commit would name, and once uploaded it writes
// that runtime in the bucket of the updates, which `release:js` reads.
//
// The stage's values come from `packages/infra/.env.<stage>`, the account of Cloudflare from
// `packages/infra/.env`, and the keys from the root `.env`, which names the files they lie in.
// None is printed, and none goes to the install or to Expo's tools, which run code that other
// people wrote: the key of the updates signs here and the R2 token writes from here. Xcode is
// given the key of App Store Connect, and Gradle the upload key, which their builds need. Expo
// receives nothing, and no `eas` command runs.
import { copyFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  PLATFORMS,
  readShipped,
  shippedKey,
  updatesBucketName,
} from "../apps/updates/src/bucket.ts";
import {
  buildNumberOf,
  exportOptionsOf,
  runtimeDrift,
  runtimeOf,
  shippedOf,
  workspaceOf,
} from "../apps/updates/src/builds.ts";
import { releaseToPlay, serviceAccountOf } from "../apps/updates/src/play.ts";
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
import { APP_SCHEME, APP_SLUG } from "../packages/config/src/app.ts";
import {
  checkoutMain,
  fail,
  failKeeping,
  git,
  keptShell,
  licenceKey,
  readEnvFile,
  removeCheckout,
  root,
  run,
  start,
} from "./lib/checkout.mjs";

const HOST_NAME = /^([a-z0-9-]+\.)+[a-z]{2,}$/;
const KINDS = {
  js: ["--platform", "--rollback", "--dry-run"],
  ios: [],
  android: ["--track", "--by-hand"],
};
const USAGE = [
  "Usage: release js <stage> [--platform ios|android] [--rollback] [--dry-run]",
  "       release ios <stage>",
  "       release android <stage> [--track <name>] [--by-hand]",
].join("\n");

const [kind, stage, ...rest] = process.argv.slice(2);
if (!(kind in KINDS) || !/^[a-z0-9][a-z0-9_-]*$/.test(stage ?? "")) fail(USAGE);
const flags = new Set();
let only = null;
// A test track of Google Play: internal testing, unless another is named.
let track = "internal";
for (let at = 0; at < rest.length; at++) {
  const flag = rest[at];
  if (!KINDS[kind].includes(flag)) fail(USAGE);
  if (flag === "--platform") {
    only = rest[++at];
    if (!PLATFORMS.includes(only)) fail(USAGE);
  } else if (flag === "--track") {
    track = rest[++at];
    if (!/^[a-z0-9:_-]+$/i.test(track ?? "")) fail(USAGE);
  } else flags.add(flag);
}
const platforms = kind === "js" ? (only ? [only] : [...PLATFORMS]) : [kind];

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
/** A file the root `.env` names, which must be there. */
function fileNamed(name, what) {
  const file = pathOf(settings[name]);
  if (!file) faults.push(`${name} is not set in .env: it names the file of ${what}`);
  else if (!existsSync(file)) faults.push(`${name} in .env names no file: ${what} is not there`);
  return file;
}
/** A value of the root `.env`, which must be set. */
function valueNamed(name, what, pattern = /./) {
  if (!settings[name]) faults.push(`${name} is not set in .env: it is ${what}`);
  else if (!pattern.test(settings[name])) faults.push(`${name} in .env is not ${what}`);
  return settings[name];
}

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
} else if (kind === "ios" && !values.APPLE_TEAM_ID) {
  faults.push(
    `APPLE_TEAM_ID is not set in packages/infra/.env.${stage}: it is the team that signs the app`,
  );
}
if (!/^[0-9a-f]{32}$/.test(access.CLOUDFLARE_ACCOUNT_ID ?? "")) {
  faults.push(
    "CLOUDFLARE_ACCOUNT_ID in packages/infra/.env is not an account id: R2's address names it",
  );
}
for (const name of ["UPDATES_R2_ACCESS_KEY_ID", "UPDATES_R2_SECRET_ACCESS_KEY"]) {
  valueNamed(name, "the R2 token of the bucket of the updates");
}

const signingKey =
  kind === "js" ? fileNamed("UPDATES_SIGNING_KEY", "the key of the updates") : null;

// The key of App Store Connect, which xcodebuild signs and altool uploads with. Apple names its
// file after its id, and altool finds it by that name.
const appStore = {};
if (kind === "ios") {
  if (process.platform !== "darwin") faults.push("An iOS build takes a Mac, with Xcode");
  appStore.id = valueNamed(
    "APP_STORE_CONNECT_KEY_ID",
    "the id of a key of App Store Connect, ten capitals and digits",
    /^[A-Z0-9]{10}$/,
  );
  appStore.issuer = valueNamed(
    "APP_STORE_CONNECT_ISSUER_ID",
    "the issuer of the keys of App Store Connect, a UUID",
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  );
  appStore.key = fileNamed("APP_STORE_CONNECT_KEY", "the key of App Store Connect");
  if (appStore.key && appStore.id && path.basename(appStore.key) !== `AuthKey_${appStore.id}.p8`) {
    faults.push(
      `APP_STORE_CONNECT_KEY in .env names a file that is not AuthKey_${appStore.id}.p8, the name ` +
        "Apple gives it and altool reads",
    );
  }
}

// The upload key, which proves that a build is Téo's, and the service account that sends it.
const play = {};
if (kind === "android") {
  play.keystore = fileNamed("ANDROID_UPLOAD_KEYSTORE", "the upload key");
  for (const name of [
    "ANDROID_UPLOAD_KEYSTORE_PASSWORD",
    "ANDROID_UPLOAD_KEY_ALIAS",
    "ANDROID_UPLOAD_KEY_PASSWORD",
  ]) {
    play[name] = valueNamed(name, "a part of the upload key");
  }
  // A build uploaded by hand asks nothing of Google's API.
  const accountFile = flags.has("--by-hand")
    ? null
    : fileNamed("GOOGLE_PLAY_SERVICE_ACCOUNT", "the key of Google Play's account");
  if (accountFile && existsSync(accountFile)) {
    try {
      play.account = serviceAccountOf(readFileSync(accountFile, "utf8"));
    } catch (error) {
      faults.push(
        `GOOGLE_PLAY_SERVICE_ACCOUNT in .env names a file that is not one: ${error.message}`,
      );
    }
  }
  if (!process.env.JAVA_HOME) {
    faults.push("JAVA_HOME is not set in the shell: Gradle runs on JDK 17, which it names");
  }
  play.sdk = process.env.ANDROID_HOME ?? path.join(os.homedir(), "Library", "Android", "sdk");
  if (!existsSync(play.sdk)) {
    faults.push(
      "ANDROID_HOME is not set in the shell, and the Android SDK is not where it installs",
    );
  }
  if (track === "production") {
    faults.push("No script releases to the public: a person promotes a build in the Play Console");
  }
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

// What Xcode, CocoaPods and Gradle need of the shell besides what the install keeps.
const BUILD_TOOLS = [
  /^(DEVELOPER_DIR|JAVA_HOME|ANDROID_HOME|ANDROID_SDK_ROOT|ANDROID_NDK_HOME|GRADLE_USER_HOME)$/,
  /^(GEM_HOME|GEM_PATH|CP_HOME_DIR)$/,
];

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
async function output(command, args, env = appEnv) {
  const {
    ok,
    output: printed,
    errors,
  } = await start(command, args, {
    keep: true,
    cwd: native,
    env,
  });
  if (!ok) {
    console.error(errors);
    failKeeping(checkout, "The release");
  }
  return printed;
}

/** Runs a step of a build, its output in the terminal, or stops the release where it failed. */
async function step(what, command, args, options) {
  if (!(await run(command, args, options))) failKeeping(checkout, what);
}

/** The runtime that a binary of this commit carries, and a publication of it names. */
const runtimeFor = async (platform) =>
  runtimeOf(await output(tool("expo-updates"), ["runtimeversion:resolve", "--platform", platform]));

await step("The install", "pnpm", ["install", "--frozen-lockfile"], {
  cwd: checkout,
  env: { ...shell, NUCLEO_LICENSE_KEY: licence },
});

async function publishJavaScript() {
  // The key signs for the certificate the binaries of `main` carry, or for nothing.
  const privateKey = readFileSync(signingKey, "utf8");
  const certificate = readFileSync(path.join(native, "certs", "certificate.pem"), "utf8");
  if (!keyMatchesCertificate(privateKey, certificate)) {
    await refuse(
      "The key UPDATES_SIGNING_KEY names does not sign for apps/native/certs/certificate.pem: " +
        "the binaries would refuse what it signs.",
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
    const other = platforms.find((platform) => !unshipped.includes(platform));
    await refuse(
      unshipped
        .map(
          (platform) =>
            `No store build of ${platform} shipped the runtime ${runtimes[platform]}: native ` +
            "code changed since the last one, and a store build is needed, " +
            `\`pnpm run release:${platform} ${stage}\`.`,
        )
        .join("\n") + (other ? `\n\`--platform ${other}\` publishes the other alone.` : ""),
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
    // The bundle is compiled to Hermes's bytecode by the React Native of the lockfile, the one
    // the binary's Hermes reads: the export never skips it.
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
    writes = inOrder(
      platforms.map((platform) => {
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
      }),
    );
  }

  if (flags.has("--dry-run")) {
    console.log(`\nA dry run: ${writes.length} objects would be written, and none was.`);
    return;
  }
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

/** The build number and the version of a store build, which its config is given. */
async function storeBuild() {
  const build = buildNumberOf(await git(["rev-list", "--count", commit]));
  const { version } = JSON.parse(readFileSync(path.join(native, "package.json"), "utf8"));
  const buildEnv = { ...appEnv, ...keptShell(BUILD_TOOLS), APP_BUILD_NUMBER: String(build) };
  console.log(`Build ${build} of version ${version}\n`);
  return { build, version, buildEnv };
}

/** Stops a build whose binary carries a runtime no publication of its commit would name. */
async function checkRuntime(platform, carried) {
  const drift = runtimeDrift(platform, carried ?? "", await runtimeFor(platform));
  if (drift) {
    console.error(drift);
    failKeeping(checkout, "The build");
  }
  return carried.trim();
}

/** Writes in the bucket that a store build shipped its runtime, which `release:js` then takes. */
async function recordShipped(platform, runtime, build, version) {
  await bucket.put(
    shippedKey(platform, runtime),
    shippedOf({ build, commit, version, shippedAt: new Date().toISOString() }),
    { contentType: "application/json", cacheControl: "no-store" },
  );
}

/** The first file under `directory` whose path ends with `ending`. */
function findFile(directory, ending) {
  for (const entry of readdirSync(directory, { withFileTypes: true, recursive: true })) {
    const file = path.join(entry.parentPath, entry.name);
    if (entry.isFile() && file.endsWith(ending)) return file;
  }
  return null;
}

async function buildForIos() {
  const { build, version, buildEnv } = await storeBuild();
  await step("The prebuild", tool("expo"), ["prebuild", "--platform", "ios", "--clean"], {
    cwd: native,
    env: buildEnv,
  });
  const ios = path.join(native, "ios");
  const workspace = workspaceOf(readdirSync(ios));
  const products = path.join(checkout, "build");
  const archive = path.join(products, `${workspace}.xcarchive`);
  // xcodebuild makes or fetches the certificates and profiles of the app and of its extensions
  // in the team, with the key of App Store Connect: the repository keeps none.
  const signing = [
    "-allowProvisioningUpdates",
    "-authenticationKeyPath",
    appStore.key,
    "-authenticationKeyID",
    appStore.id,
    "-authenticationKeyIssuerID",
    appStore.issuer,
  ];
  await step(
    "The archive",
    "xcodebuild",
    [
      "-workspace",
      path.join(ios, `${workspace}.xcworkspace`),
      "-scheme",
      workspace,
      "-configuration",
      "Release",
      "-destination",
      "generic/platform=iOS",
      "-archivePath",
      archive,
      // Its own data goes with the checkout, which no later build would find again.
      "-derivedDataPath",
      path.join(products, "DerivedData"),
      // Xcode reads GitHub's passwords from ~/.netrc as it fetches MapLibre, and never waits for
      // the keychain.
      "-packageAuthorizationProvider",
      "netrc",
      ...signing,
      "archive",
    ],
    { cwd: native, env: buildEnv },
  );

  const fingerprint = findFile(path.join(archive, "Products"), "EXUpdates.bundle/fingerprint");
  const runtime = await checkRuntime("ios", fingerprint ? readFileSync(fingerprint, "utf8") : "");

  const options = path.join(products, "ExportOptions.plist");
  writeFileSync(options, exportOptionsOf(values.APPLE_TEAM_ID));
  const exported = path.join(products, "export");
  await step(
    "The export",
    "xcodebuild",
    [
      "-exportArchive",
      "-archivePath",
      archive,
      "-exportPath",
      exported,
      "-exportOptionsPlist",
      options,
      ...signing,
    ],
    { cwd: native, env: buildEnv },
  );
  const ipa = findFile(exported, ".ipa");
  if (!ipa) failKeeping(checkout, "The export, which wrote no .ipa,");

  await step(
    "The upload",
    "xcrun",
    [
      "altool",
      "--upload-app",
      "--type",
      "ios",
      "--file",
      ipa,
      "--apiKey",
      appStore.id,
      "--apiIssuer",
      appStore.issuer,
    ],
    { cwd: native, env: { ...shell, API_PRIVATE_KEYS_DIR: path.dirname(appStore.key) } },
  );
  await recordShipped("ios", runtime, build, version);
  console.log(
    `\nBuild ${build} of ${version} is uploaded, for the runtime ${runtime}. TestFlight's ` +
      "internal testers get it once Apple has processed it; a person releases it to the store.",
  );
}

async function buildForAndroid() {
  const { build, version, buildEnv } = await storeBuild();
  await step("The prebuild", tool("expo"), ["prebuild", "--platform", "android", "--clean"], {
    cwd: native,
    env: buildEnv,
  });
  const android = path.join(native, "android");
  // Gradle alone gets the upload key, in its environment, which the config plugin of
  // apps/native/plugins/release-signing.js reads. No daemon outlives the build with it.
  await step("The build", "./gradlew", ["app:bundleRelease", "--no-daemon"], {
    cwd: android,
    env: {
      ...buildEnv,
      ANDROID_HOME: play.sdk,
      ANDROID_UPLOAD_KEYSTORE: play.keystore,
      ANDROID_UPLOAD_KEYSTORE_PASSWORD: play.ANDROID_UPLOAD_KEYSTORE_PASSWORD,
      ANDROID_UPLOAD_KEY_ALIAS: play.ANDROID_UPLOAD_KEY_ALIAS,
      ANDROID_UPLOAD_KEY_PASSWORD: play.ANDROID_UPLOAD_KEY_PASSWORD,
    },
  });
  const bundle = path.join(
    android,
    "app",
    "build",
    "outputs",
    "bundle",
    "release",
    "app-release.aab",
  );
  if (!existsSync(bundle)) failKeeping(checkout, "The build, which wrote no .aab,");

  // The fingerprint lies among the bundle's assets, which unzip reads out of it.
  const carried = await start("unzip", ["-p", bundle, "base/assets/fingerprint"], {
    keep: true,
    cwd: android,
    env: shell,
  });
  const runtime = await checkRuntime("android", carried.ok ? carried.output : "");

  // Google's API takes a bundle only for an app that has one already: the first goes up by hand,
  // in the Play Console, from where this leaves it. Its runtime is written now, as Google will
  // have it once it is uploaded.
  if (flags.has("--by-hand")) {
    const kept = path.join(os.tmpdir(), `${APP_SCHEME}-${build}.aab`);
    copyFileSync(bundle, kept);
    await recordShipped("android", runtime, build, version);
    console.log(
      `\nBuild ${build} of ${version}, for the runtime ${runtime}, is at ${kept}. Upload it to ` +
        "internal testing in the Play Console, then delete it.",
    );
    return;
  }

  let versionCode;
  try {
    versionCode = await releaseToPlay({
      account: play.account,
      packageName: APP_SCHEME,
      bundle: new Uint8Array(readFileSync(bundle)),
      track,
      name: `${version} (${build})`,
    });
  } catch (error) {
    console.error(error.message);
    failKeeping(checkout, "The upload");
  }
  if (versionCode !== build) {
    console.error(`Google Play read the version code ${versionCode} where the build is ${build}.`);
  }
  await recordShipped("android", runtime, build, version);
  console.log(
    `\nBuild ${build} of ${version} is on the track ${track} of Google Play, for the runtime ` +
      `${runtime}. A person promotes it to the store in the Play Console.`,
  );
}

if (kind === "js") await publishJavaScript();
else if (kind === "ios") await buildForIos();
else await buildForAndroid();
await removeCheckout(checkout, "The release is done");
