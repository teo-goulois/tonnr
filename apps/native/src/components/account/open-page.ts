import * as WebBrowser from "expo-web-browser";
import { useCallback } from "react";

import { ENV } from "@/env";
import { useTheme } from "@/lib/theme";
import { getLocale } from "@/paraglide/runtime";

import { type SitePage, siteAddress } from "./site-pages";

/**
 * Opens a page of the site, or another address, in the browser the system draws over the app:
 * Safari's sheet on iOS, a Custom Tab on Android, in the theme's colors. The app stays where it
 * was under it (decision 069).
 */
export function useOpenPage() {
  const { colors } = useTheme();
  const open = useCallback(
    (address: string) =>
      WebBrowser.openBrowserAsync(address, {
        controlsColor: colors["color-1"],
        toolbarColor: colors["cte-canvas"],
        dismissButtonStyle: "close",
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
        enableBarCollapsing: true,
        showTitle: true,
      }).catch(() => undefined),
    [colors],
  );
  return {
    /** A page of the site, in the app's language. */
    openPage: (page: SitePage) => open(siteAddress(ENV.EXPO_PUBLIC_SITE_URL, getLocale(), page)),
    /** An address of its own, such as the repository's. */
    openAddress: open,
  };
}
