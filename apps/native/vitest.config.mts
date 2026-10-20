import { paraglideVitePlugin } from "@inlang/paraglide-js";
import { defineConfig } from "vitest/config";

// The tests compile the web app's messages for themselves, into a directory that is not the
// app's, so that a test and the type check never write the same files: `pnpm run check` runs the
// two side by side. They read what holds no React Native: the app's own logic, and its config.
const compiled = "./node_modules/.cache/paraglide";
const from = (path: string) => new URL(path, import.meta.url).pathname;

export default defineConfig({
  plugins: [
    paraglideVitePlugin({
      project: "../web/project.inlang",
      outdir: compiled,
      strategy: ["globalVariable", "baseLocale"],
      outputStructure: "locale-modules",
      isServer: "false",
    }),
  ],
  resolve: {
    alias: [
      { find: "@/paraglide", replacement: from(compiled) },
      { find: "@", replacement: from("./src") },
    ],
  },
  test: { include: ["src/**/*.test.ts", "*.test.ts", "plugins/**/*.test.ts"] },
});
