import { paraglideVitePlugin } from "@inlang/paraglide-js";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { type Plugin, defineConfig } from "vite";

import { messages } from "./paraglide.config.ts";
import { RELEASE_FILE, releaseFile } from "./src/lib/release.ts";

// A build gives itself a name, tells it to the app and writes it in a file beside the app. An
// app that is open reads the file again and learns from it that the stage was deployed since:
// `src/lib/release.ts`. A development server has neither. The build reads this file more than
// once, so the name is kept where each reading finds it.
function release(): Plugin {
  const name = (process.env.WEB_RELEASE ??= Date.now().toString(36));
  return {
    name: "release",
    apply: "build",
    config: () => ({ define: { "import.meta.env.VITE_RELEASE": JSON.stringify(name) } }),
    generateBundle() {
      if (this.environment.name !== "client") return;
      this.emitFile({ type: "asset", fileName: RELEASE_FILE, source: releaseFile(name) });
    },
  };
}

// PROTOTYPE: a demo through a tunnel serves the API at the web app's own address, so that a phone
// needs one address and the session's cookie is the site's own.
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
  plugins: [paraglideVitePlugin(messages), tailwindcss(), tanstackStart(), viteReact(), release()],
});
