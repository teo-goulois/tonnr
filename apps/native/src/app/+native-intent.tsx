import { openBrowserAsync } from "expo-web-browser";

import { ENV } from "@/env";
import { destinationOfAddress } from "@/lib/links";
import { client } from "@/utils/orpc";

// What a link that opens the app becomes, before expo-router reads it: a universal link or an App
// Link of the web app's site, a link of the app's scheme, or the address a push carries
// (decision 073). The development build's own links pass as they are.

/** The route of a surf break named by the address of its page, merged or not: decision 057. */
async function routeOfBreakPage(page: { country: string; region: string; slug: string }) {
  let address = page;
  for (let hop = 0; hop < 3; hop++) {
    const answer = await client.v1.pages.break(address);
    if (!answer.moved) return `/place/break/${encodeURIComponent(answer.break.id)}`;
    address = answer.to;
  }
  return "/";
}

export async function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  try {
    if (path.includes("expo-development-client")) return path;
    const destination = destinationOfAddress(path, ENV.EXPO_PUBLIC_SITE_URL);
    if ("route" in destination) return destination.route;
    if ("breakPage" in destination) return await routeOfBreakPage(destination.breakPage);
    // An address of the app's own scheme that names no page of the site is one of its screens.
    if (!/^https?:/i.test(path)) return path;
    void openBrowserAsync(destination.browser);
    return initial ? "/" : null;
  } catch {
    return initial ? "/" : null;
  }
}
