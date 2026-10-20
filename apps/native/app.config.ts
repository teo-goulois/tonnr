import { readFileSync } from "node:fs";

import { APP_NAME, APP_SCHEME, APP_SLUG } from "@repo/config/app";
import { claimedPaths } from "@repo/config/links";
import { LOCALES } from "@repo/config/locales";
import type { ConfigContext, ExpoConfig } from "expo/config";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as {
  version: string;
};

// The web app's site, whose addresses the app opens (decision 073): the store's builds name Téo's.
const site = new URL(process.env.EXPO_PUBLIC_SITE_URL ?? "https://tonnr.app");
// Apple and Google verify a domain over HTTPS only: a build against a local site claims none.
const claimsLinks = site.protocol === "https:";

// What the phone shows when the app asks for a permission, in each language, from the web app's
// messages, where every string a person reads is kept (decision 069).
type Messages = Record<string, string>;
const messagesOf = (locale: string): Messages =>
  JSON.parse(readFileSync(new URL(`../web/messages/${locale}.json`, import.meta.url), "utf8"));
const named = (text: string | undefined) => (text ?? "").replaceAll("{name}", APP_NAME);
const permissionsOf = (messages: Messages) => ({
  NSLocationWhenInUseUsageDescription: named(messages.native_permission_location),
  NSCameraUsageDescription: named(messages.native_permission_camera),
  NSPhotoLibraryUsageDescription: named(messages.native_permission_photos),
  NSMicrophoneUsageDescription: named(messages.native_permission_microphone),
});
const english = permissionsOf(messagesOf("en"));

// The app for phones: decision 069. Its identifiers stay once it is in a store, whatever the
// name becomes, so they come from `APP_SCHEME` and never from `APP_NAME`.
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: APP_NAME,
  slug: APP_SLUG,
  scheme: APP_SCHEME,
  version: pkg.version,
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  icon: "./assets/icon.png",
  ios: {
    bundleIdentifier: APP_SCHEME,
    // The team that signs the app and its extensions: from the shell that builds, never written
    // here (decision 075).
    appleTeamId: process.env.APPLE_TEAM_ID,
    infoPlist: { ...english, CFBundleAllowMixedLocalizations: true },
    // The site's links open the app, and the keychain fills its passwords: decision 073.
    // What the app shares with its extensions: the keys a push is opened with, and later the
    // widgets' data (decisions 072 and 074).
    entitlements: { "com.apple.security.application-groups": [`group.${APP_SCHEME}`] },
    associatedDomains: claimsLinks ? [`applinks:${site.host}`, `webcredentials:${site.host}`] : [],
    buildNumber: "1",
    supportsTablet: false,
    config: { usesNonExemptEncryption: false },
  },
  android: {
    package: APP_SCHEME,
    versionCode: 1,
    predictiveBackGestureEnabled: true,
    intentFilters: claimsLinks
      ? [
          {
            action: "VIEW",
            autoVerify: true,
            category: ["BROWSABLE", "DEFAULT"],
            // Android matches a path with `*` only: `:id` becomes it.
            data: claimedPaths().map((path) => ({
              scheme: "https",
              host: site.host,
              pathPattern: path.replace(/:[a-z]+/g, ".*"),
            })),
          },
        ]
      : [],
  },
  locales: Object.fromEntries(
    LOCALES.filter((locale) => locale !== "en").map((locale) => [
      locale,
      permissionsOf(messagesOf(locale)),
    ]),
  ),
  plugins: [
    "expo-router",
    "expo-image",
    "expo-video",
    "expo-sharing",
    "expo-sqlite",
    "expo-background-task",
    "expo-quick-actions",
    "@maplibre/maplibre-react-native",
    ["expo-location", { locationWhenInUsePermission: english.NSLocationWhenInUseUsageDescription }],
    [
      "expo-camera",
      {
        cameraPermission: english.NSCameraUsageDescription,
        microphonePermission: english.NSMicrophoneUsageDescription,
        recordAudioAndroid: true,
      },
    ],
    [
      "expo-image-picker",
      {
        photosPermission: english.NSPhotoLibraryUsageDescription,
        cameraPermission: english.NSCameraUsageDescription,
        microphonePermission: english.NSMicrophoneUsageDescription,
      },
    ],
    "expo-notifications",
    // The notification extension of decision 072, in targets/notifications.
    "@bacons/apple-targets",
    "expo-secure-store",
    "expo-localization",
    "expo-web-browser",
    [
      "expo-splash-screen",
      {
        backgroundColor: "#ffffff",
        dark: { backgroundColor: "#000000" },
        image: "./assets/splash.png",
        imageWidth: 120,
      },
    ],
    // Geist, the theme's type, under the OFL (assets/fonts/OFL.txt). Each weight is its own file,
    // named as iOS names it, so that a family names one weight on both platforms.
    [
      "expo-font",
      {
        fonts: [
          "Geist-Regular",
          "Geist-Medium",
          "Geist-Bold",
          "GeistMono-Regular",
          "GeistMono-Medium",
          "GeistMono-Bold",
        ].map((font) => `./assets/fonts/${font}.ttf`),
      },
    ],
  ],
  experiments: { typedRoutes: true, reactCompiler: true },
});
