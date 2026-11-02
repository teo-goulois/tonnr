import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import type { AppRouterClient } from "@repo/api/routers/index";
import { QueryClient, focusManager } from "@tanstack/react-query";
import { fetch as expoFetch } from "expo/fetch";
import { addNetworkStateListener } from "expo-network";
import { AppState } from "react-native";

import { linkHeaders } from "@/components/lists/shared-link";
import { ENV } from "@/env";
import { analyticsHeaders } from "@/lib/analytics";
import { APP_ORIGIN, appHeader } from "@/lib/app-client";
import { keepAnswers } from "@/lib/answer-store";
import { authClient } from "@/lib/auth-client";
import { getLocale } from "@/paraglide/runtime";

export const queryClient: QueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
      // What the sea at a place answered, the places and the account's spots and lists are kept
      // on the phone, and shown where the network does not reach until a newer answer comes:
      // decision 080.
      persister: (queryFn, context, query) => keptAnswer(queryFn, context, query),
    },
  },
});
const keptAnswer = keepAnswers(queryClient.getQueryCache());

// The app is in focus while it is on the screen, as a browser's tab is for the web's queries: a
// query in view that is older than its minute is asked again as the app comes back, as the web's
// is as its window does, and none is asked at intervals while the app is away. TanStack Query's
// own way for React Native.
focusManager.setEventListener((handleFocus) => {
  const listening = AppState.addEventListener("change", (state) => handleFocus(state === "active"));
  return () => listening.remove();
});

// The network that comes back reads again what is in view and is not new, an answer kept on the
// phone among it, as a browser's window does as it comes back online. The queries still know
// nothing of the network otherwise: one asked without it fails and shows what was kept, which a
// query waiting for the network would not read (decision 080).
let connected: boolean | undefined;
addNetworkStateListener(({ isConnected }) => {
  if (isConnected === undefined) return;
  if (isConnected && connected === false) {
    void queryClient.refetchQueries({ type: "active", stale: true });
  }
  connected = isConnected;
});

/**
 * The API's typed client, on `/rpc`. Each call carries the session's cookie, which the app keeps
 * itself, names the app in `expo-origin`, and says what the app is in `X-App`: decision 069.
 * The phone's own cookies are left out, so that a stale one never rides along. Once the person
 * said yes to the analytics, it carries their consent and ids too, so that the API captures the
 * action (decision 044).
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
      ...analyticsHeaders(),
    };
  },
});

export const client: AppRouterClient = createORPCClient(link);

export const orpc = createTanstackQueryUtils(client);
