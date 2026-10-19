import * as SecureStore from "expo-secure-store";

// Readable once the phone was unlocked after it started, so that a widget and the work the
// system wakes the app for read the session too. Decision 070.
const KEPT = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };

/** Where the sign-in library keeps the session's cookie: the phone's keychain or keystore. */
export const secureStorage = {
  getItem: (key: string) => SecureStore.getItem(key, KEPT),
  getItemAsync: (key: string) => SecureStore.getItemAsync(key, KEPT),
  setItem: (key: string, value: string) => SecureStore.setItem(key, value, KEPT),
  setItemAsync: (key: string, value: string) => SecureStore.setItemAsync(key, value, KEPT),
};
