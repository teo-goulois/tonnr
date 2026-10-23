// Releases the app for phones of one stage, from what `main` holds on the remote, in a checkout
// of its own: decision 075.
//
//   pnpm run release:js <stage> [--platform ios|android] [--rollback [--runtime <fingerprint>]]
//                               [--dry-run]
//   pnpm run release:ios <stage>
//   pnpm run release:android <stage> [--track <name>] [--by-hand]
//
// `release:js` publishes `main`'s JavaScript as an update of each platform: `expo export`, then
// the runtime its fingerprint names, which a store build must have shipped, then the files under
// the key of their hash, every signed manifest, and last what points each runtime's apps at its
// own. `--rollback` sends the apps of the runtime back to the JavaScript of their binary instead,
// of the runtime `--runtime` names with `--platform` when it is not `main`'s, and `--dry-run`
// builds and signs everything and writes nothing. The key must sign for the certificate that the
// store build of each runtime carries, read from the commit it was built from.
//
// `release:ios` and `release:android` make a store build: `expo prebuild --clean`, then Xcode or
// Gradle, signed with the keys of this Mac, then the upload to TestFlight or to a test track of
// Google Play, from which a person promotes it. The build number is the count of commits of
// `main` up to the one built. Before it uploads, a build checks that the runtime its binary
// carries is the one a publication of the same commit would name, and once uploaded it writes
// that runtime in the bucket of the updates, which `release:js` reads.
//
// What builds and writes is `main`'s own: once the checkout is installed, the layout of the
// bucket, the manifest, the signing and the builds' rules are imported from it, so that what the
// bucket gets is what the Worker deployed from `main` reads, whatever this checkout holds. Only
// what refuses a release before the checkout is read from here: the arguments, the files of the
// keys and whether the R2 token may read the bucket.
//
// The stage's values come from `packages/infra/.env.<stage>`, the account of Cloudflare from
// `packages/infra/.env`, and the keys from the root `.env`, which names the files they lie in.
// None is printed, and none goes to the install or to Expo's tools, which run code that other
// people wrote: the key of the updates signs here and the R2 token writes from here. xcodebuild
// is given the path of the key of App Store Connect in its arguments, and altool the directory it
// lies in, and the export finds the team's distribution key in a keychain of the run's own, which
// goes once it is done, and its profiles, which the same key of App Store Connect makes. Gradle reads the upload key from a file of its own, outside the checkout and deleted
// once it is done, which a property names: its environment, which Metro and the other tools of
// the build inherit, holds none of it. Expo receives nothing, and no `eas` command runs.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

// What refuses a release before the checkout, read from this checkout. Nothing of it writes.
import { PLATFORMS, shippedKey, updatesBucketName } from "../apps/updates/src/bucket.ts";
import { serviceAccountOf } from "../apps/updates/src/play.ts";
import { r2Client } from "../apps/updates/src/r2.ts";
import { APP_SLUG } from "../packages/config/src/app.ts";
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
  js: ["--platform", "--rollback", "--runtime", "--dry-run"],
  ios: [],
  android: ["--track", "--by-hand"],
};
const USAGE = [
  "Usage: release js <stage> [--platform ios|android] [--rollback [--runtime <fingerprint>]] " +
    "[--dry-run]",
  "       release ios <stage>",
  "       release android <stage> [--track <name>] [--by-hand]",
].join("\n");

const [kind, stage, ...rest] = process.argv.slice(2);
if (!(kind in KINDS) || !/^[a-z0-9][a-z0-9_-]*$/.test(stage ?? "")) fail(USAGE);
const flags = new Set();
let only = null;
// The runtime a rollback sends back, when it is not the one `main` builds: one a store build
// shipped before native code changed.
let rolledRuntime = null;
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
  } else if (flag === "--runtime") {
    rolledRuntime = rest[++at];
    if (!/^[0-9a-f]{40}$/.test(rolledRuntime ?? "")) fail(USAGE);
  } else flags.add(flag);
}
if (rolledRuntime && (!flags.has("--rollback") || !only)) {
  fail(`--runtime names the runtime of one platform that a rollback sends back:\n${USAGE}`);
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
  // The team's distribution certificate and its key, which sign the build on this Mac. Without
  // them xcodebuild signs through Apple's cloud, which writes a name outside ASCII, as Téo's,
  // decomposed in the designated requirement of each piece of the app while the certificate
  // holds it composed, and App Store Connect refuses every piece (ITMS-90035).
  appStore.distributionKey = fileNamed(
    "APPLE_DISTRIBUTION_KEY",
    "the key of the team's distribution certificate",
  );
  appStore.distributionCertificate = fileNamed(
    "APPLE_DISTRIBUTION_CERTIFICATE",
    "the team's distribution certificate",
  );
  if (appStore.key && appStore.id && path.basename(appStore.key) !== `AuthKey_${appStore.id}.p8`) {
    faults.push(
      `APP_STORE_CONNECT_KEY in .env names a file that is not AuthKey_${appStore.id}.p8, the name ` +
        "Apple gives it and altool reads",
    );
  }
}

// Firebase's file of the Android app, which it registers for push with (decision 072). The
// fingerprint of its runtime hashes the file, so a store build and a publication read the same.
const googleServices = platforms.includes("android")
  ? fileNamed("GOOGLE_SERVICES_FILE", "Firebase's google-services.json of the Android app")
  : null;

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

const r2Access = {
  accountId: access.CLOUDFLARE_ACCOUNT_ID,
  accessKeyId: settings.UPDATES_R2_ACCESS_KEY_ID,
  secretAccessKey: settings.UPDATES_R2_SECRET_ACCESS_KEY,
};
const bucketName = updatesBucketName(APP_SLUG, stage);

// Whether the R2 token reads the bucket, before anything is built: a store build that reached
// its store and could not write its runtime would leave release:js refusing it.
{
  const refusal = await r2Client({ ...r2Access, bucket: bucketName })
    .refusal(shippedKey(PLATFORMS[0], "0"))
    .catch((error) => error.message);
  if (refusal) {
    fail(
      `The R2 token of .env, UPDATES_R2_ACCESS_KEY_ID and UPDATES_R2_SECRET_ACCESS_KEY, cannot ` +
        `read the bucket ${bucketName}: ${refusal}\nIt needs "Object Read & Write" on that ` +
        `bucket, which \`pnpm run deploy:updates ${stage}\` makes. Nothing was built.`,
    );
  }
}

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
  ...(googleServices && { GOOGLE_SERVICES_FILE: googleServices }),
  // The stage's project of PostHog and the environment its events say, which the app sends to
  // through the web's `/ingest` once a person said yes: Metro writes them into the JavaScript,
  // and the config reads neither, so that they change no fingerprint (decisions 044 and 069).
  // The stage must name its host too: the web's `/ingest` forwards to it alone, and a web app
  // without it sends nothing and asks nothing, as the app then does.
  ...(values.VITE_POSTHOG_PROJECT_TOKEN &&
    values.VITE_POSTHOG_HOST && {
      EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN: values.VITE_POSTHOG_PROJECT_TOKEN,
      ...(values.VITE_POSTHOG_ENVIRONMENT && {
        EXPO_PUBLIC_POSTHOG_ENVIRONMENT: values.VITE_POSTHOG_ENVIRONMENT,
      }),
    }),
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
  main.builds.runtimeOf(
    await output(tool("expo-updates"), ["runtimeversion:resolve", "--platform", platform]),
  );

await step("The install", "pnpm", ["install", "--frozen-lockfile"], {
  cwd: checkout,
  env: { ...shell, NUCLEO_LICENSE_KEY: licence },
});

/** A module of the commit built, which Node runs as it is written, imports resolved there. */
const fromMain = (file) => import(pathToFileURL(path.join(checkout, file)).href);
// What builds and writes, from `main`: the Worker deployed from it reads what they write.
let main;
try {
  main = {
    bucket: await fromMain("apps/updates/src/bucket.ts"),
    builds: await fromMain("apps/updates/src/builds.ts"),
    appStore: await fromMain("apps/updates/src/app-store.ts"),
    play: await fromMain("apps/updates/src/play.ts"),
    publish: await fromMain("apps/updates/src/publish.ts"),
    r2: await fromMain("apps/updates/src/r2.ts"),
    app: await fromMain("packages/config/src/app.ts"),
    uploadKey: (await fromMain("apps/native/plugins/upload-key.js")).default,
  };
} catch (error) {
  await refuse(`main does not hold what the release reads: ${error.message}`);
}
if (main.bucket.updatesBucketName(main.app.APP_SLUG, stage) !== bucketName) {
  await refuse(
    `main names the bucket ${main.bucket.updatesBucketName(main.app.APP_SLUG, stage)} where ` +
      `this checkout names ${bucketName}: pull, then release again.`,
  );
}
const bucket = main.r2.r2Client({ ...r2Access, bucket: bucketName });

/**
 * The certificate that the store build of a runtime carries, from the commit it was built from:
 * the binaries of a runtime refuse what another key signed, those of an older certificate too.
 */
async function certificateOf(shipped) {
  try {
    return await git(["show", `${shipped.commit}:apps/native/certs/certificate.pem`]);
  } catch (error) {
    throw new Error(
      `The certificate of build ${shipped.build}, of commit ${shipped.commit}, cannot be read: ` +
        error.message,
    );
  }
}

async function publishJavaScript() {
  const privateKey = readFileSync(signingKey, "utf8");

  // Each platform's runtime, which a store build must have shipped: an update built for native
  // code that no binary has would reach none, or crash those it reached. A rollback may name an
  // older one, which phones run while `main` builds another.
  const runtimes = {};
  const builds = {};
  const unshipped = [];
  for (const platform of platforms) {
    runtimes[platform] = rolledRuntime ?? (await runtimeFor(platform));
    const shipped = await bucket.get(main.bucket.shippedKey(platform, runtimes[platform]));
    builds[platform] = shipped && main.bucket.readShipped(new TextDecoder().decode(shipped));
    if (!builds[platform]) unshipped.push(platform);
  }
  if (unshipped.length > 0) {
    const other = platforms.find((platform) => !unshipped.includes(platform));
    await refuse(
      unshipped
        .map((platform) =>
          rolledRuntime
            ? `No store build of ${platform} shipped the runtime ${rolledRuntime}: no phone runs it.`
            : `No store build of ${platform} shipped the runtime ${runtimes[platform]}: native ` +
              "code changed since the last one, and a store build is needed, " +
              `\`pnpm run release:${platform} ${stage}\`.`,
        )
        .join("\n") + (other ? `\n\`--platform ${other}\` publishes the other alone.` : ""),
    );
  }

  // The key signs for the certificate the binaries of each runtime carry, or for nothing. After a
  // new certificate, a rollback of an older runtime takes the older key.
  for (const platform of platforms) {
    const shipped = builds[platform];
    if (!main.publish.keyMatchesCertificate(privateKey, await certificateOf(shipped))) {
      await refuse(
        `The key UPDATES_SIGNING_KEY names does not sign for the certificate that build ` +
          `${shipped.build} of ${platform}, of commit ${shipped.commit.slice(0, 12)}, carries: ` +
          `the binaries of ${runtimes[platform]} would refuse what it signs. Name that ` +
          "certificate's key in UPDATES_SIGNING_KEY.",
      );
    }
  }

  let writes;
  const now = new Date().toISOString();
  if (flags.has("--rollback")) {
    writes = main.publish.inOrder(
      platforms.map((platform) =>
        main.publish.rollbackWrites(
          platform,
          runtimes[platform],
          main.publish.newUpdateId(),
          now,
          privateKey,
        ),
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
    writes = main.publish.inOrder(
      platforms.map((platform) => {
        const { manifest, writes: platformWrites } = main.publish.updateWrites(
          platform,
          {
            id: main.publish.newUpdateId(),
            createdAt: now,
            runtime: runtimes[platform],
            exported: main.publish.readExport(exported, platform),
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
    const { sent, kept } = await main.publish.writeAll(bucket, writes);
    console.log(
      `\nPublished: ${sent} objects written, and ${kept} files the bucket held already. ` +
        "The apps of each runtime take it at their second start.",
    );
  } catch (error) {
    // The pointers are written last: those written before the fault are the only part of the
    // publication that apps follow.
    console.error(error.message);
    const pointed = error.pointed ?? [];
    const left = platforms.filter((platform) => !pointed.some((at) => at.platform === platform));
    console.error(
      pointed.length === 0
        ? "Nothing points at what was written: the apps see none of it, and the command may run again."
        : `The apps of ${pointed.map((at) => `${at.platform} (${at.runtime})`).join(" and ")} ` +
            "follow the publication already. " +
            (left.length > 0
              ? `Publish the rest alone, with \`--platform ${left.join("` and `--platform ")}\`, ` +
                "or the others get the same JavaScript a second time under another id."
              : ""),
    );
    failKeeping(checkout, "The publication");
  }
}

/** The build number and the version of a store build, which its config is given. */
async function storeBuild() {
  const build = main.builds.buildNumberOf(await git(["rev-list", "--count", commit]));
  const { version } = JSON.parse(readFileSync(path.join(native, "package.json"), "utf8"));
  const buildEnv = { ...appEnv, ...keptShell(BUILD_TOOLS), APP_BUILD_NUMBER: String(build) };
  console.log(`Build ${build} of version ${version}\n`);
  return { build, version, buildEnv };
}

/** Stops a build whose binary carries a runtime no publication of its commit would name. */
async function checkRuntime(platform, carried) {
  const drift = main.builds.runtimeDrift(platform, carried ?? "", await runtimeFor(platform));
  if (drift) {
    console.error(drift);
    failKeeping(checkout, "The build");
  }
  return carried.trim();
}

/** Writes in the bucket that a store build shipped its runtime, which `release:js` then takes. */
async function recordShipped(platform, runtime, build, version) {
  const shipped = { build, commit, version, shippedAt: new Date().toISOString() };
  try {
    await bucket.put(main.bucket.shippedKey(platform, runtime), main.builds.shippedOf(shipped), {
      contentType: "application/json",
      cacheControl: "no-store",
    });
  } catch (error) {
    // The build is in its store: what is missing is the record that lets updates reach it.
    console.error(
      `${error.message}\nThe build is uploaded, and its runtime is not written in the bucket: ` +
        `release:js refuses ${runtime} until ${main.bucket.shippedKey(platform, runtime)} holds ` +
        JSON.stringify(shipped),
    );
    failKeeping(checkout, "The record of the build");
  }
}

/** The first file under `directory` whose path ends with `ending`. */
function findFile(directory, ending) {
  for (const entry of readdirSync(directory, { withFileTypes: true, recursive: true })) {
    const file = path.join(entry.parentPath, entry.name);
    if (entry.isFile() && file.endsWith(ending)) return file;
  }
  return null;
}

/** Runs `security`, which keeps the keychains, and says whether it succeeded. */
function security(args) {
  return spawnSync("security", args, { stdio: ["ignore", "ignore", "inherit"] }).status === 0;
}

/** The keychains this account searches, as `security` lists them. */
function searchedKeychains() {
  const listed = spawnSync("security", ["list-keychains", "-d", "user"], { encoding: "utf8" });
  return [...(listed.stdout ?? "").matchAll(/"(.+)"/g)].map((found) => found[1]);
}

/**
 * Runs `work` with the team's distribution certificate and its key in a keychain of the run's
 * own, which the account searches meanwhile and which goes once `work` is done, whatever came of
 * it. Says whether it succeeded.
 */
async function withDistributionKey(work) {
  const searched = searchedKeychains();
  // The search list is given back as it was read: one read wrong would be given back empty.
  if (searched.length === 0) {
    console.error("The keychains this account searches could not be read.");
    return false;
  }
  const directory = mkdtempSync(path.join(os.tmpdir(), "distribution-"));
  const keychain = path.join(directory, "release.keychain-db");
  const password = randomBytes(24).toString("hex");
  try {
    const ready =
      security(["create-keychain", "-p", password, keychain]) &&
      // It stays unlocked while the build lasts.
      security(["set-keychain-settings", keychain]) &&
      security(["unlock-keychain", "-p", password, keychain]) &&
      security(["import", appStore.distributionKey, "-k", keychain, "-T", "/usr/bin/codesign"]) &&
      security(["import", appStore.distributionCertificate, "-k", keychain]) &&
      // codesign reads the key without asking anyone.
      security([
        "set-key-partition-list",
        "-S",
        "apple-tool:,apple:,codesign:",
        "-s",
        "-k",
        password,
        keychain,
      ]) &&
      security(["list-keychains", "-d", "user", "-s", keychain, ...searched]);
    return ready && (await work());
  } finally {
    security(["list-keychains", "-d", "user", "-s", ...searched]);
    security(["delete-keychain", keychain]);
    rmSync(directory, { recursive: true, force: true });
  }
}

/** The bundle identifiers of the app an archive holds and of its extensions. */
function identifiersOf(archive) {
  const applications = path.join(archive, "Products", "Applications");
  const app = readdirSync(applications).find((name) => name.endsWith(".app"));
  if (!app) return [];
  const plugIns = path.join(applications, app, "PlugIns");
  const extensions = existsSync(plugIns)
    ? readdirSync(plugIns).filter((name) => name.endsWith(".appex"))
    : [];
  return [path.join(applications, app), ...extensions.map((name) => path.join(plugIns, name))].map(
    (bundle) =>
      spawnSync(
        "plutil",
        ["-extract", "CFBundleIdentifier", "raw", "-o", "-", path.join(bundle, "Info.plist")],
        { encoding: "utf8" },
      ).stdout.trim(),
  );
}

// Where Xcode finds the profiles installed on this Mac.
const PROFILES = path.join(
  os.homedir(),
  "Library",
  "Developer",
  "Xcode",
  "UserData",
  "Provisioning Profiles",
);

async function buildForIos() {
  const { build, version, buildEnv } = await storeBuild();
  // Xcode gives its scripts the project's folder through macOS's link, /var/folders, and Metro,
  // which works from the real path, refuses the widgets' layouts named through it: CocoaPods
  // writes the real folder into the phase that bundles them, from PROJECT_ROOT as it installs.
  await step("The prebuild", tool("expo"), ["prebuild", "--platform", "ios", "--clean"], {
    cwd: native,
    env: { ...buildEnv, PROJECT_ROOT: native },
  });
  const ios = path.join(native, "ios");
  const workspace = main.builds.workspaceOf(readdirSync(ios));
  const products = path.join(checkout, "build");
  const archive = path.join(products, `${workspace}.xcarchive`);
  // xcodebuild makes or fetches the profiles of the app and of its extensions in the team, with
  // the key of App Store Connect: the repository keeps none.
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

  // A profile of the App Store for the app and for each extension, made for this release with
  // the distribution certificate alone, which the export signs with by hand: in automatic
  // signing, xcodebuild chooses between that key and Apple's cloud by rules Apple does not say.
  const identifiers = identifiersOf(archive);
  if (identifiers.length === 0 || identifiers.some((identifier) => !identifier)) {
    failKeeping(checkout, "The archive, whose identifiers could not be read,");
  }
  const certificate = readFileSync(appStore.distributionCertificate);
  let profiles;
  try {
    profiles = await main.appStore.storeProfiles({
      key: {
        id: appStore.id,
        issuer: appStore.issuer,
        privateKey: readFileSync(appStore.key, "utf8"),
      },
      certificate,
      identifiers,
    });
  } catch (error) {
    console.error(error.message);
    failKeeping(checkout, "The profiles");
  }
  const options = path.join(products, "ExportOptions.plist");
  writeFileSync(
    options,
    main.builds.exportOptionsOf(values.APPLE_TEAM_ID, {
      certificate: main.appStore.certificateHashOf(certificate),
      profiles: Object.fromEntries(profiles.map(({ identifier, uuid }) => [identifier, uuid])),
    }),
  );
  const exported = path.join(products, "export");
  // The profiles are installed where Xcode reads them while the export lasts, and the export signs
  // every piece of the app again, with the team's distribution key, here.
  mkdirSync(PROFILES, { recursive: true });
  const installed = profiles.map(({ uuid, content }) => {
    const file = path.join(PROFILES, `${uuid}.mobileprovision`);
    writeFileSync(file, content);
    return file;
  });
  let signed = false;
  try {
    signed = await withDistributionKey(() =>
      run(
        "xcodebuild",
        [
          "-exportArchive",
          "-archivePath",
          archive,
          "-exportPath",
          exported,
          "-exportOptionsPlist",
          options,
        ],
        { cwd: native, env: buildEnv },
      ),
    );
  } finally {
    for (const file of installed) rmSync(file, { force: true });
  }
  if (!signed) failKeeping(checkout, "The export");
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
  // The upload key goes to Gradle in a file of its own, in a directory that only this account
  // reads, outside the checkout, which a project property names and which is deleted once Gradle
  // is done: Gradle's environment, which Metro and every other tool of the build inherit, holds
  // none of it. No daemon outlives the build with it.
  const { UPLOAD_KEY_PROPERTY, uploadKeyProperties } = main.uploadKey;
  const keyDirectory = mkdtempSync(path.join(os.tmpdir(), "upload-key-"));
  const keyFile = path.join(keyDirectory, "upload-key.properties");
  let built = false;
  try {
    writeFileSync(
      keyFile,
      uploadKeyProperties({
        storeFile: play.keystore,
        storePassword: play.ANDROID_UPLOAD_KEYSTORE_PASSWORD,
        keyAlias: play.ANDROID_UPLOAD_KEY_ALIAS,
        keyPassword: play.ANDROID_UPLOAD_KEY_PASSWORD,
      }),
      { mode: 0o600 },
    );
    built = await run(
      "./gradlew",
      ["app:bundleRelease", "--no-daemon", `-P${UPLOAD_KEY_PROPERTY}=${keyFile}`],
      { cwd: android, env: { ...buildEnv, ANDROID_HOME: play.sdk } },
    );
  } finally {
    rmSync(keyDirectory, { recursive: true, force: true });
  }
  if (!built) failKeeping(checkout, "The build");
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
    const kept = path.join(os.tmpdir(), `${main.app.APP_SCHEME}-${build}.aab`);
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
    versionCode = await main.play.releaseToPlay({
      account: play.account,
      packageName: main.app.APP_SCHEME,
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

try {
  if (kind === "js") await publishJavaScript();
  else if (kind === "ios") await buildForIos();
  else await buildForAndroid();
} catch (error) {
  // A fault of R2, of a file or of a tool's answer, which the steps above do not foresee.
  console.error(error.message);
  failKeeping(checkout, "The release");
}
await removeCheckout(checkout, "The release is done");
