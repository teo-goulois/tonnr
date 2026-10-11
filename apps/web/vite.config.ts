import { paraglideVitePlugin } from "@inlang/paraglide-js";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { messages } from "./paraglide.config.ts";

export default defineConfig({
  server: {
    port: 3001,
    allowedHosts: ["tonnr.localify"],
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [paraglideVitePlugin(messages), tailwindcss(), tanstackStart(), viteReact()],
});
