// How the updates of the apps for phones are signed: the key that `pnpm run release:js` signs
// with is named by this id, and the binary, which carries its certificate, refuses an update that
// names another or was signed otherwise. Changing either takes a store build. Decision 075.
export const UPDATES_KEY_ID = "main";
export const UPDATES_SIGNATURE_ALGORITHM = "rsa-v1_5-sha256";
