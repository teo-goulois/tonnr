// Signs the Android release build with the upload key, which only proves that a build is Téo's:
// Google signs what phones install (Play App Signing). `expo prebuild --clean` writes android/
// again at each build, so the signing is given here, and the key's path and passwords come from
// Gradle's environment, which `pnpm run release:android` gives it: nothing writes them into the
// checkout. A release build without them is signed with the debug key, as before, and Google
// Play refuses it. Decision 075.
const { withAppBuildGradle } = require("expo/config-plugins");

/** The variables of Gradle's environment that hold the upload key. */
const UPLOAD_KEY = {
  store: "ANDROID_UPLOAD_KEYSTORE",
  storePassword: "ANDROID_UPLOAD_KEYSTORE_PASSWORD",
  alias: "ANDROID_UPLOAD_KEY_ALIAS",
  password: "ANDROID_UPLOAD_KEY_PASSWORD",
};

const RELEASE_CONFIG = `        release {
            // The upload key, from the environment of \`pnpm run release:android\` (decision 075).
            if (System.getenv("${UPLOAD_KEY.store}")) {
                storeFile file(System.getenv("${UPLOAD_KEY.store}"))
                storePassword System.getenv("${UPLOAD_KEY.storePassword}")
                keyAlias System.getenv("${UPLOAD_KEY.alias}")
                keyPassword System.getenv("${UPLOAD_KEY.password}")
            }
        }
`;

/**
 * The app's build.gradle, with a release signing that reads the upload key from the
 * environment. It fails on a template it does not know, rather than build with the debug key.
 *
 * @param {string} gradle
 * @returns {string}
 */
function withUploadKey(gradle) {
  if (gradle.includes(UPLOAD_KEY.store)) return gradle;
  const signingConfigs = /(\n\s*signingConfigs\s*\{\n)/;
  const releaseSigning =
    /(buildTypes\s*\{[\s\S]*?\brelease\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/;
  if (!signingConfigs.test(gradle) || !releaseSigning.test(gradle)) {
    throw new Error("android/app/build.gradle has no signing of its release where Expo writes it");
  }
  return gradle
    .replace(signingConfigs, `$1${RELEASE_CONFIG}`)
    .replace(
      releaseSigning,
      `$1signingConfig System.getenv("${UPLOAD_KEY.store}") ? signingConfigs.release : signingConfigs.debug`,
    );
}

/** @type {import('expo/config-plugins').ConfigPlugin} */
const withReleaseSigning = (config) =>
  withAppBuildGradle(config, (gradle) => {
    if (gradle.modResults.language !== "groovy") {
      throw new Error("android/app/build.gradle is not Groovy: its release cannot be signed");
    }
    gradle.modResults.contents = withUploadKey(gradle.modResults.contents);
    return gradle;
  });

module.exports = withReleaseSigning;
module.exports.withUploadKey = withUploadKey;
module.exports.UPLOAD_KEY = UPLOAD_KEY;
