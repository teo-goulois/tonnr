import { usernameClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import { ENV } from "../env.public";

export const authClient = createAuthClient({
  baseURL: ENV.VITE_SERVER_URL,
  // What others read of an account: the API keeps it, and says whether one is free.
  plugins: [usernameClient()],
});
