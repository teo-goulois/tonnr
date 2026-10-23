import { expoClient } from "@better-auth/expo/client";
import { APP_SCHEME, APP_SLUG } from "@repo/config/app";
import { usernameClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import { ENV } from "@/env";
import { getLocale } from "@/paraglide/runtime";

import { analyticsHeaders } from "./analytics";
import { appHeader } from "./app-client";
import { secureStorage } from "./secure-storage";

/**
 * The sign-in library's client: it keeps the session's cookie in the phone's keychain, and names
 * the app in `expo-origin`. Every call says the app's language, which the mails it sends are
 * written in: Android sends none by itself. It says what the app is in `X-App`, and, once the
 * person said yes to the analytics, their consent and ids, so that the API captures a sign-up, a
 * sign-in, a sign-out and a change of the account as the web's (decisions 044 and 069). Decisions
 * 069 and 070.
 */
export const authClient = createAuthClient({
  baseURL: ENV.EXPO_PUBLIC_SERVER_URL,
  fetchOptions: {
    onRequest: (context) => {
      context.headers.set("Accept-Language", getLocale());
      context.headers.set("X-App", appHeader());
      for (const [name, value] of Object.entries(analyticsHeaders())) {
        context.headers.set(name, value);
      }
      return context;
    },
  },
  plugins: [
    usernameClient(),
    expoClient({ scheme: APP_SCHEME, storagePrefix: APP_SLUG, storage: secureStorage }),
  ],
});
