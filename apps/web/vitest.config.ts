import { paraglideVitePlugin } from "@inlang/paraglide-js";
import { defineConfig } from "vitest/config";

import { messages } from "./paraglide.config.ts";

// The tests compile the messages for themselves, into a directory that is not the app's. A test
// then reads them in a checkout that was never built, and never while a build is writing them:
// `pnpm run check` runs the two side by side.
const compiled = "./node_modules/.cache/paraglide";
const from = (path: string) => new URL(path, import.meta.url).pathname;

export default defineConfig({
  // A test reads no `.env` of the checkout, as in CI, which has none.
  envDir: false,
  plugins: [paraglideVitePlugin({ ...messages, outdir: compiled })],
  resolve: {
    // The first that matches wins: the messages before everything else under `src`.
    alias: [
      { find: "@/paraglide", replacement: from(compiled) },
      { find: "@", replacement: from("./src") },
    ],
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
    // What a module reads as it loads, such as the API's address in `utils/orpc.ts`, which a test
    // never calls.
    env: { VITE_SERVER_URL: "https://api.example.test" },
  },
});
