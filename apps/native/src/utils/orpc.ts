import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import type { AppRouterClient } from "@repo/api/routers/index";
import { QueryClient, focusManager } from "@tanstack/react-query";
import { fetch as expoFetch } from "expo/fetch";
import { AppState } from "react-native";

import { linkHeaders } from "@/components/lists/shared-link";
import { ENV } from "@/env";
import { APP_ORIGIN, appHeader } from "@/lib/app-client";
import { authClient } from "@/lib/auth-client";
import { getLocale } from "@/paraglide/runtime";

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, retry: 1 } },
});

// The app is in focus while it is on the screen, as a browser's tab is for the web's queries: a
// query in view that is older than its minute is asked again as the app comes back, as the web's
// is as its window does, and none is asked at intervals while the app is away. TanStack Query's
// own way for React Native.
focusManager.setEventListener((handleFocus) => {
  const listening = AppState.addEventListener("change", (state) => handleFocus(state === "active"));
  return () => listening.remove();
});

/**
 * The API's typed client, on `/rpc`. Each call carries the session's cookie, which the app keeps
 * itself, names the app in `expo-origin`, and says what the app is in `X-App`: decision 069.
 * The phone's own cookies are left out, so that a stale one never rides along.
 */
export const link = new RPCLink({
  url: `${ENV.EXPO_PUBLIC_SERVER_URL}/rpc`,
  async fetch(request, init) {
    // React Native's Request leaves `body` empty whatever it holds: read it as text.
    const reads = request.method === "GET" || request.method === "HEAD";
    return expoFetch(request.url, {
      body: reads ? undefined : await request.text(),
      headers: request.headers,
      method: request.method,
      signal: request.signal,
      ...init,
      credentials: "omit",
    });
  },
  async headers() {
    const cookie = await authClient.getCookie();
    return {
      ...(cookie && { Cookie: cookie }),
      ...linkHeaders(cookie),
      "expo-origin": APP_ORIGIN,
      "X-App": appHeader(),
      "Accept-Language": getLocale(),
    };
  },
});

export const client: AppRouterClient = createORPCClient(link);

export const orpc = createTanstackQueryUtils(client);
