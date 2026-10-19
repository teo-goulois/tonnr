// Builds the development build for an iPhone simulator, installs it and opens it on the Metro
// that runs on this Mac: `pnpm --filter native ios:simulator [simulator name]`.
//
// `expo run:ios` refuses to build once the app asks for push and Sign in with Apple, which a
// simulator does not sign for, and Xcode looks for GitHub's passwords in the keychain as it
// fetches MapLibre, which stops a build that no one watches. This builds with xcodebuild instead,
// unsigned, reading a .netrc in place of the keychain. Decision 075.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const name = process.argv[2] ?? "iPhone 18 Pro";
const app = new URL("..", import.meta.url).pathname;
const run = (command, args, options = {}) =>
  execFileSync(command, args, { cwd: app, stdio: "inherit", ...options });

const devices = JSON.parse(
  execFileSync("xcrun", ["simctl", "list", "devices", "available", "--json"], { encoding: "utf8" }),
).devices;
const device = Object.values(devices)
  .flat()
  .find((candidate) => candidate.name === name);
if (!device) throw new Error(`No simulator named ${name}: xcrun simctl list devices available`);
if (device.state !== "Booted") run("xcrun", ["simctl", "boot", device.udid]);

if (!existsSync(join(app, "ios"))) run("npx", ["expo", "prebuild", "-p", "ios", "--no-install"]);
if (!existsSync(join(app, "ios", "Pods"))) run("pod", ["install"], { cwd: join(app, "ios") });

const BUILD = [
  "-packageAuthorizationProvider",
  "netrc",
  "-workspace",
  "ios/Tonnr.xcworkspace",
  "-scheme",
  "Tonnr",
  "-configuration",
  "Debug",
  "-sdk",
  "iphonesimulator",
  "-destination",
  `id=${device.udid}`,
  "CODE_SIGN_IDENTITY=-",
  "CODE_SIGNING_REQUIRED=NO",
];
// Xcode's own derived data outlives `expo prebuild --clean`, so a build after it is quick.
run("xcodebuild", [...BUILD, "build"]);
const settings = execFileSync("xcodebuild", [...BUILD, "-showBuildSettings"], {
  cwd: app,
  encoding: "utf8",
});
const productsDir = /^\s*TARGET_BUILD_DIR = (.+)$/m.exec(settings)?.[1];
if (!productsDir) throw new Error("xcodebuild did not say where it built the app");
const built = join(productsDir, "Tonnr.app");
run("xcrun", ["simctl", "install", device.udid, built]);
// The development build opens on the Metro of this Mac, which `pnpm run dev:native` starts.
const metro = encodeURIComponent("http://localhost:8081");
spawnSync("xcrun", [
  "simctl",
  "openurl",
  device.udid,
  `exp+tonnr://expo-development-client/?url=${metro}`,
]);
console.log(`Opened on ${name}. iOS asks once whether to open the link in the app.`);
