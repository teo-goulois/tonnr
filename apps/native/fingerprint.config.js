// What the fingerprint of a binary hashes besides what Expo reads. The fingerprint names its
// runtime, and an update goes only to the binaries of its runtime: a new certificate of the
// updates, which comes with a store build, makes a runtime of its own. Decision 075.

/** @type {import('@expo/fingerprint').Config} */
module.exports = {
  extraSources: [
    { type: "file", filePath: "certs/certificate.pem", reasons: ["updatesCodeSigningCertificate"] },
  ],
};
