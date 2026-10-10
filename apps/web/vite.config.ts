import { paraglideVitePlugin } from "@inlang/paraglide-js";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// PROTOTYPE: a demo through a tunnel serves the API at the web app's own address. A phone then
// needs one address, and the session's cookie is the site's own, which Safari keeps.
const demoApi = process.env.DEMO_API;

export default defineConfig({
  server: {
    port: 3001,
    allowedHosts: ["tonnr.localify", ...(demoApi ? [".trycloudflare.com"] : [])],
    ...(demoApi ? { proxy: { "/rpc": demoApi, "/api/auth": demoApi, "/v1": demoApi } } : {}),
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    paraglideVitePlugin({
      project: "./project.inlang",
      outdir: "./src/paraglide",
      outputStructure: "message-modules",
      cookieName: "PARAGLIDE_LOCALE",
      strategy: ["url", "cookie", "preferredLanguage", "baseLocale"],
      // English has no prefix, French lives under /fr. The French pattern comes first, or the
      // English one would match every path.
      urlPatterns: [
        {
          pattern: "/:path(.*)?",
          localized: [
            ["fr", "/fr/:path(.*)?"],
            ["en", "/:path(.*)?"],
          ],
        },
      ],
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
});
