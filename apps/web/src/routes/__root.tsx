import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { APP_NAME } from "@repo/config/app";
import { Toaster } from "@repo/ui/components/ui/sonner";
import { ThemeProvider } from "next-themes";

import { AppHotkeys } from "@/components/shared/app-hotkeys";
import { CommandPalette } from "@/components/shared/command-palette";
import { ShortcutSettings } from "@/components/shared/shortcut-settings";
import type { orpc } from "@/utils/orpc";

import { getLocale } from "@/paraglide/runtime.js";

import appCss from "../index.css?url";
export interface RouterAppContext {
  orpc: typeof orpc;
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: APP_NAME,
      },
      {
        name: "apple-mobile-web-app-title",
        content: APP_NAME,
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      {
        rel: "icon",
        type: "image/png",
        href: "/favicon-96x96.png",
        sizes: "96x96",
      },
      {
        rel: "icon",
        type: "image/svg+xml",
        href: "/favicon.svg",
      },
      {
        rel: "shortcut icon",
        href: "/favicon.ico",
      },
      {
        rel: "apple-touch-icon",
        sizes: "180x180",
        href: "/apple-touch-icon.png",
      },
      {
        rel: "manifest",
        href: "/site.webmanifest",
      },
    ],
  }),

  component: RootDocument,
});

const isDevtoolsEnabled = false;

function RootDocument() {
  return (
    // next-themes sets the theme class on <html> before React hydrates.
    <html lang={getLocale()} suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <AppHotkeys />
          <CommandPalette />
          <ShortcutSettings />
          <Outlet />
          <Toaster />
        </ThemeProvider>
        {isDevtoolsEnabled && <TanStackRouterDevtools position="bottom-left" />}
        {isDevtoolsEnabled && (
          <ReactQueryDevtools position="bottom" buttonPosition="bottom-right" />
        )}
        <Scripts />
      </body>
    </html>
  );
}
