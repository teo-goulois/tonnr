import { type AppLink, readAppLink } from "@repo/config/links";

/**
 * Where a link takes the app: the route of a screen, or an address to open in the browser inside
 * the app. A universal link, an App Link, a link of the app's scheme and the address a push
 * carries are all read by `readAppLink` (packages/config/src/links.ts), as the web reads them,
 * then turned here into the app's own routes. Decision 073.
 */
export type AppDestination =
  | { route: string }
  // The page of a surf break names it by its address; the route is found by asking the API.
  | { breakPage: { country: string; region: string; slug: string } }
  | { browser: string };

// The steps of the account's tab that an address of the web names with `settings=`.
const ACCOUNT_STEPS: Record<string, string> = {
  alerts: "/account/alerts",
  profile: "/account/profile",
  sessions: "/account/logbook",
  contributions: "/account/contributions",
  friends: "/account/friends",
  blocked: "/account/blocked",
  delete: "/account/delete",
};

const KINDS = ["break", "station", "spot"] as const;

function withQuery(path: string, query: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(query)) if (value) params.set(name, value);
  const written = params.toString();
  return written ? `${path}?${written}` : path;
}

/** The route of the app for what a link names. */
export function destinationOf(link: AppLink): AppDestination {
  if (link.screen === "browser") return { browser: link.url };
  if (link.screen === "break") {
    return { breakPage: { country: link.country, region: link.region, slug: link.slug } };
  }
  if (link.screen === "reset-password") {
    return { route: withQuery("/reset-password", { token: link.token ?? undefined }) };
  }

  const search = link.search;
  // An alert begun at a break from its page: decision 059's button.
  if (search.create === "alert" && search.break) {
    return { route: withQuery("/alert/new", { place: `break:${search.break}` }) };
  }
  for (const kind of KINDS) {
    const id = search[kind];
    if (id) {
      const tab = search.notice ? "reports" : search.tab;
      return {
        route: withQuery(`/place/${kind}/${encodeURIComponent(id)}`, {
          tab,
          notice: search.notice,
        }),
      };
    }
  }
  if (search.shared) return { route: `/shared/${encodeURIComponent(search.shared)}` };
  if (search.invite) return { route: withQuery("/", { invite: search.invite }) };
  if (search.list) return { route: withQuery("/", { list: search.list }) };
  if (search.panel === "saved") return { route: "/saved" };
  if (search.panel === "alerts") return { route: "/alerts" };
  if (search.panel === "account") {
    const step = search.settings ? ACCOUNT_STEPS[search.settings] : undefined;
    return { route: step ?? "/account" };
  }
  return { route: "/" };
}

/** Where an address takes the app, read against the web app's site it was built with. */
export function destinationOfAddress(address: string, site: string): AppDestination {
  return destinationOf(readAppLink(address, site));
}
