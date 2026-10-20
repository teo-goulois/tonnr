// The extension that opens a push before iOS shows it: it decrypts what the push says with the
// phone's keys, which the app keeps in the keychain of the group they share, and attaches a
// report's photo. Decision 072. Its bundle is app.tonnr.notifications (decision 069). Its group
// is the app's own, read from the app's config, so that the two are written in one place.
/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: "notification-service",
  name: "Notifications",
  bundleIdentifier: ".notifications",
  deploymentTarget: "16.4",
  frameworks: ["CryptoKit", "UniformTypeIdentifiers"],
  entitlements: {
    "com.apple.security.application-groups":
      config.ios.entitlements["com.apple.security.application-groups"],
  },
});
