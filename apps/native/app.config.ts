import { readFileSync } from "node:fs";

import { APP_NAME, APP_SCHEME, APP_SLUG } from "@repo/config/app";
import { claimedPaths } from "@repo/config/links";
import { LOCALES } from "@repo/config/locales";
import { UPDATES_KEY_ID, UPDATES_SIGNATURE_ALGORITHM } from "@repo/config/updates";
import type { ConfigContext, ExpoConfig } from "expo/config";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as {
  version: string;
};

// The web app's site, whose addresses the app opens (decision 073): the store's builds name Téo's.
const site = new URL(process.env.EXPO_PUBLIC_SITE_URL ?? "https://tonnr.app");
// Apple and Google verify a domain over HTTPS only: a build against a local site claims none.
const claimsLinks = site.protocol === "https:";

// Where the binary asks for updates of its JavaScript, which stays in it for good: the release
// commands give the stage's to a store build, and a development build, which names none, never
// asks (decision 075).
const updatesUrl = process.env.UPDATES_URL || undefined;
// The build number, the same on both platforms: the count of commits of `main` up to the one
// built, which the release commands give. A store takes each once (decision 075).
const build = process.env.APP_BUILD_NUMBER || "1";
if (!/^[1-9]\d*$/.test(build)) throw new Error(`APP_BUILD_NUMBER is not a build number: ${build}`);
// Firebase's file of the instance's project, which the Android app registers for push with, by
// its path, from the shell that builds and never written here: the store's builds take Téo's
// (decision 072). A build without it registers no Android phone.
const googleServices = process.env.GOOGLE_SERVICES_FILE || undefined;

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

// The widgets of decision 074, which expo-widgets builds into an extension of their own,
// `<bundle>.widgets`, sharing the app's group. Their names are those of src/widgets/names.ts,
// which this file cannot import and which `src/widgets/config.test.ts` holds them to. Their words
// are written in English, and the extension's own strings say them in each other language.
const LAYOUTS = "./src/widgets/layouts.tsx";
const placeChoice = (messages: Messages) => ({
  title: messages.native_widget_choose_title ?? "",
  description: messages.native_widget_choose_description ?? "",
  parameters: {
    place: {
      title: messages.native_widget_place_parameter ?? "",
      type: "enum",
      // The account's saved places, which the app gives as it writes the widgets.
      dynamic: true,
      default: "favorite",
      values: [{ name: messages.native_widget_first_favorite ?? "", value: "favorite" }],
    },
  },
});
const widgetsOf = (messages: Messages) => {
  const widget = (name: string, words: string, families: string[], chosen: boolean) => ({
    name,
    displayName: messages[`native_widget_${words}_name`] ?? "",
    description: messages[`native_widget_${words}_description`] ?? "",
    ios: {
      supportedFamilies: families,
      initialLayout: LAYOUTS,
      ...(chosen && { configuration: placeChoice(messages) }),
    },
    // Android's widgets wait: expo-widgets 58 opens nothing from a press there (decision 074).
    android: null,
  });
  return [
    // On the Home Screen, and on the lock screen: the height alone, or with the wind and the tide.
    widget("SeaNow", "sea_now", ["systemSmall", "accessoryCircular", "accessoryRectangular"], true),
    widget("NextHours", "next_hours", ["systemMedium"], true),
    widget("Favorites", "favorites", ["systemMedium"], false),
  ];
};
// What the extension says in a language, keyed by the English it is written in. The system
// names a configuration by its title followed by " Configuration", which is said as the title.
const WIDGET_WORDS = [
  ...["sea_now", "next_hours", "favorites"].flatMap((words) => [
    `native_widget_${words}_name`,
    `native_widget_${words}_description`,
  ]),
  "native_widget_choose_title",
  "native_widget_choose_description",
  "native_widget_place_parameter",
  "native_widget_first_favorite",
];
const widgetStringsOf = (messages: Messages) => {
  const en = messagesOf("en");
  const said = (key: string) => messages[key] ?? en[key] ?? "";
  return {
    ...Object.fromEntries(WIDGET_WORDS.map((key) => [en[key] ?? key, said(key)])),
    [`${en.native_widget_choose_title} Configuration`]: said("native_widget_choose_title"),
  };
};

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
    infoPlist: {
      ...english,
      CFBundleAllowMixedLocalizations: true,
      // iPadOS runs this iPhone app in a window of its own and, when the iPad lies in landscape,
      // turns a window that allows portrait alone on its side, squeezed to the screen's height
      // (seen on iPadOS 27, and with a bare UIKit app too). Allowed every orientation on an
      // iPad, the window stays upright and the app is laid out in it as on a phone. An iPhone
      // reads the key without `~ipad`, which Expo writes from `orientation`, and stays in
      // portrait.
      "UISupportedInterfaceOrientations~ipad": [
        "UIInterfaceOrientationPortrait",
        "UIInterfaceOrientationPortraitUpsideDown",
        "UIInterfaceOrientationLandscapeLeft",
        "UIInterfaceOrientationLandscapeRight",
      ],
    },
    // The site's links open the app, and the keychain fills its passwords: decision 073.
    // What the app shares with its extensions: the keys a push is opened with, and later the
    // widgets' data (decisions 072 and 074).
    entitlements: { "com.apple.security.application-groups": [`group.${APP_SCHEME}`] },
    associatedDomains: claimsLinks ? [`applinks:${site.host}`, `webcredentials:${site.host}`] : [],
    buildNumber: build,
    supportsTablet: false,
    usesAppleSignIn: true,
    config: { usesNonExemptEncryption: false },
  },
  android: {
    package: APP_SCHEME,
    ...(googleServices && { googleServicesFile: googleServices }),
    versionCode: Number(build),
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
    LOCALES.map((locale) => [
      locale,
      {
        ...(locale !== "en" && permissionsOf(messagesOf(locale))),
        ios: { "Localizable.strings": widgetStringsOf(messagesOf(locale)) },
      },
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
    // Android draws a notification's small icon by its alpha alone: the app's icon, which has
    // none, would be a white square in the status bar. This is its mark in white on nothing,
    // which the plugin writes as the drawable notification_icon (decisions 072 and 074).
    ["expo-notifications", { icon: "./assets/notification-icon.png" }],
    // The notification extension of decision 072, in targets/notifications.
    "@bacons/apple-targets",
    // The widgets and the Live Activities of decision 074, on iOS: their extension, in the app's
    // group, whose space keeps what the app writes for them, the layouts of the activities, of a
    // session in progress and of a window that begins, among it; Apple's pushes start, update and
    // end those of a window, so the app asks for their tokens.
    [
      "expo-widgets",
      {
        bundleIdentifier: `${APP_SCHEME}.widgets`,
        groupIdentifier: `group.${APP_SCHEME}`,
        enablePushNotifications: true,
        widgets: widgetsOf(messagesOf("en")),
      },
    ],
    "expo-secure-store",
    "expo-updates",
    // The upload key of a release for Google Play, from the file a property of Gradle names:
    // decision 075.
    "./plugins/release-signing.js",
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
  // The updates of the JavaScript, from the instance's own server and signed by its key, whose
  // certificate the binary carries: decision 075. An update goes to the binaries whose native
  // code it was built with, which their fingerprint names. The app asks at each start, starts on
  // what it has, and runs what it downloaded at the next start.
  ...(updatesUrl && { runtimeVersion: { policy: "fingerprint" } }),
  updates: updatesUrl
    ? {
        enabled: true,
        url: updatesUrl,
        checkAutomatically: "ON_LOAD",
        fallbackToCacheTimeout: 0,
        codeSigningCertificate: "./certs/certificate.pem",
        codeSigningMetadata: { keyid: UPDATES_KEY_ID, alg: UPDATES_SIGNATURE_ALGORITHM },
      }
    : { enabled: false },
});
