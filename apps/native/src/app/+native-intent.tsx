import { openBrowserAsync } from "expo-web-browser";

import { giveToSheet } from "@/components/map/open-place";
import { ENV } from "@/env";
import { destinationOfAddress, type Route } from "@/lib/links";
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

/** The route expo-router opens, or none when the sheet of a place that is open took it. */
function given(route: string, initial: boolean) {
  return !initial && giveToSheet(route as Route) ? null : route;
}

export async function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  try {
    if (path.includes("expo-development-client")) return path;
    const destination = destinationOfAddress(path, ENV.EXPO_PUBLIC_SITE_URL);
    // A place named while the sheet of another is open is given to that sheet, as the web's one
    // panel shows what was chosen last, and expo-router is told nothing.
    if ("route" in destination) return given(destination.route, initial);
    if ("breakPage" in destination) {
      return given(await routeOfBreakPage(destination.breakPage), initial);
    }
    // An address of the app's own scheme that names no page of the site is one of its screens.
    if (!/^https?:/i.test(path)) return path;
    void openBrowserAsync(destination.browser);
    return initial ? "/" : null;
  } catch {
    return initial ? "/" : null;
  }
}
