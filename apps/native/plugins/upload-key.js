// How the upload key reaches Gradle for an Android release: in a file of its own, which a
// project property of Gradle names, and never in Gradle's environment, which every tool the build
// runs inherits, Metro's and the autolinking's included. `pnpm run release:android` writes the
// file, in a directory of its own outside the checkout, and deletes it once Gradle is done; the
// config plugin of release-signing.js reads it. This module requires nothing, so that the release
// command reads it without loading Expo's code. Decision 075.

/** The project property of Gradle that names the file. */
const UPLOAD_KEY_PROPERTY = "uploadKeyFile";

/** The names the file gives the parts of the key, as Android's signing config names them. */
const UPLOAD_KEY_FIELDS = ["storeFile", "storePassword", "keyAlias", "keyPassword"];

/**
 * A value as `java.util.Properties` reads it from a file, which it reads in ISO 8859-1: a
 * backslash, a space, a separator or a comment's mark escaped, and every other character outside
 * printable ASCII written as `\uXXXX`.
 *
 * @param {string} value
 * @returns {string}
 */
function escaped(value) {
  let written = "";
  for (let at = 0; at < value.length; at++) {
    const character = value.charAt(at);
    const code = value.charCodeAt(at);
    if (character === "\\") written += "\\\\";
    else if (character === "\t") written += "\\t";
    else if (character === "\n") written += "\\n";
    else if (character === "\r") written += "\\r";
    else if (character === "\f") written += "\\f";
    else if (" =:#!".includes(character)) written += `\\${character}`;
    else if (code < 0x20 || code > 0x7e) written += `\\u${code.toString(16).padStart(4, "0")}`;
    else written += character;
  }
  return written;
}

/**
 * The file of the upload key, which Gradle reads with `java.util.Properties`.
 *
 * @param {{ storeFile: string, storePassword: string, keyAlias: string, keyPassword: string }} key
 * @returns {string}
 */
function uploadKeyProperties(key) {
  return UPLOAD_KEY_FIELDS.map((field) => {
    const value = key[field];
    if (typeof value !== "string" || value === "")
      throw new Error(`The upload key has no ${field}`);
    return `${field}=${escaped(value)}\n`;
  }).join("");
}

module.exports = { UPLOAD_KEY_PROPERTY, UPLOAD_KEY_FIELDS, uploadKeyProperties };
