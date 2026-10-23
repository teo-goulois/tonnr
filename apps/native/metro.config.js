// Metro, as Expo configures it for a pnpm workspace, with Uniwind's stylesheet, Reanimated and
// Varlock's settings. Decision 069.
const { withVarlockMetroConfig } = require("@varlock/expo-integration/metro-config");
const { getDefaultConfig } = require("expo/metro-config");
const { wrapWithReanimatedMetroConfig } = require("react-native-reanimated/metro-config");
const { withUniwindConfig } = require("uniwind/metro");

// The app's messages are the web app's, compiled into src/paraglide, which Git ignores: compiled
// before Metro resolves a module, since a fresh checkout, as a store build's, has none, and again
// when a file of apps/web/messages changes, a pull included, so that a screen never reads a
// message the compiled files do not have yet. The watcher keeps no process alive that would
// otherwise end, such as an export.
const { execFile, execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const { watch } = require("node:fs");
const path = require("node:path");

// The script names its paths from the app's folder, wherever Metro was started from.
const script = path.join(__dirname, "scripts/messages.mjs");
const compileMessages = () => execFile(process.execPath, [script], { cwd: __dirname }, () => {});
execFileSync(process.execPath, [script], {
  cwd: __dirname,
  stdio: ["ignore", "ignore", "inherit"],
});
let pending;
try {
  watch(path.join(__dirname, "../web/messages"), () => {
    clearTimeout(pending);
    pending = setTimeout(compileMessages, 300);
  }).unref();
} catch {
  // Without a watcher, a restart of Metro compiles them.
}

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

const wrapped = withVarlockMetroConfig(
  withUniwindConfig(wrapWithReanimatedMetroConfig(config), {
    cssEntryFile: "./src/global.css",
    dtsFile: "./src/uniwind-types.d.ts",
  }),
);

// Metro keeps what it transformed under a key made of a file's text, in a directory every
// checkout of the machine shares, which Uniwind names. What Varlock writes into a file as it is
// transformed, the values of the app's settings, is not in that key: a build whose values
// changed and no file did would take the transforms of the last one, a store build included.
// The key is given the values Varlock loaded, hashed, which change only with them.
wrapped.cacheVersion = createHash("sha256")
  .update(process.env.__VARLOCK_ENV ?? "")
  .digest("hex");

module.exports = wrapped;
