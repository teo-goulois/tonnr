import { ENV } from "../env.public";

/**
 * What a page that a link is sent to tells Safari on an iPhone, which then draws its banner over
 * the page: get the app in the App Store, or open it at this page's address. Nothing until the
 * stage names the app's id in the App Store, which it has once the app is there. Chrome on
 * Android has no such banner. Decision 073.
 */
export function appBanner(address: string, storeId = ENV.VITE_APP_STORE_ID) {
  if (!storeId) return [];
  return [{ name: "apple-itunes-app", content: `app-id=${storeId}, app-argument=${address}` }];
}
