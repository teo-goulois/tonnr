import { usernameClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import { ENV } from "../env.public";
import { analyticsHeaders } from "./analytics";

export const authClient = createAuthClient({
  baseURL: ENV.VITE_SERVER_URL,
  fetchOptions: {
    customFetchImpl: (url, options) => {
      const headers = new Headers(options?.headers);
      for (const [key, value] of Object.entries(analyticsHeaders())) headers.set(key, value);
      return fetch(url, { ...options, headers });
    },
  },
  // What others read of an account: the API keeps it, and says whether one is free.
  plugins: [usernameClient()],
});
