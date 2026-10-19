// Metro, as Expo configures it for a pnpm workspace, with Uniwind's stylesheet, Reanimated and
// Varlock's settings. Decision 069.
const { withVarlockMetroConfig } = require("@varlock/expo-integration/metro-config");
const { getDefaultConfig } = require("expo/metro-config");
const { wrapWithReanimatedMetroConfig } = require("react-native-reanimated/metro-config");
const { withUniwindConfig } = require("uniwind/metro");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

module.exports = withVarlockMetroConfig(
  withUniwindConfig(wrapWithReanimatedMetroConfig(config), {
    cssEntryFile: "./src/global.css",
    dtsFile: "./src/uniwind-types.d.ts",
  }),
);
