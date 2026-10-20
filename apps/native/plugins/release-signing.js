// Signs the Android release build with the upload key, which only proves that a build is Téo's:
// Google signs what phones install (Play App Signing). `expo prebuild --clean` writes android/
// again at each build, so the signing is given here. The key's path and passwords come from the
// file that the project property of upload-key.js names, which `pnpm run release:android` writes
// outside the checkout and deletes once the build is done: nothing writes them into the checkout,
// and Gradle's environment, which the tools of the build inherit, holds none of them. A release
// build without it is signed with the debug key, as before, and Google Play refuses it.
// Decision 075.
const { withAppBuildGradle } = require("expo/config-plugins");

const { UPLOAD_KEY_PROPERTY } = require("./upload-key.js");

const RELEASE_CONFIG = `        release {
            // The upload key, from the file \`pnpm run release:android\` names (decision 075).
            if (project.hasProperty("${UPLOAD_KEY_PROPERTY}")) {
                def uploadKey = new Properties()
                file(project.property("${UPLOAD_KEY_PROPERTY}")).withInputStream { uploadKey.load(it) }
                storeFile file(uploadKey.getProperty("storeFile"))
                storePassword uploadKey.getProperty("storePassword")
                keyAlias uploadKey.getProperty("keyAlias")
                keyPassword uploadKey.getProperty("keyPassword")
            }
        }
`;

/**
 * The app's build.gradle, with a release signing that reads the upload key from the file the
 * project property names. It fails on a template it does not know, rather than build with the
 * debug key.
 *
 * @param {string} gradle
 * @returns {string}
 */
function withUploadKey(gradle) {
  if (gradle.includes(UPLOAD_KEY_PROPERTY)) return gradle;
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
      `$1signingConfig project.hasProperty("${UPLOAD_KEY_PROPERTY}") ? signingConfigs.release : signingConfigs.debug`,
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
