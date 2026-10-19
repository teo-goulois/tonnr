import { expoClient } from "@better-auth/expo/client";
import { APP_SCHEME, APP_SLUG } from "@repo/config/app";
import { usernameClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import { ENV } from "@/env";
import { getLocale } from "@/paraglide/runtime";

import { secureStorage } from "./secure-storage";

/**
 * The sign-in library's client: it keeps the session's cookie in the phone's keychain, and names
 * the app in `expo-origin`. Every call says the app's language, which the mails it sends are
 * written in: Android sends none by itself. Decisions 069 and 070.
 */
export const authClient = createAuthClient({
  baseURL: ENV.EXPO_PUBLIC_SERVER_URL,
  fetchOptions: {
    onRequest: (context) => {
      context.headers.set("Accept-Language", getLocale());
      return context;
    },
  },
  plugins: [
    usernameClient(),
    expoClient({ scheme: APP_SCHEME, storagePrefix: APP_SLUG, storage: secureStorage }),
  ],
});
