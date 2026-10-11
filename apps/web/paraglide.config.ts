import type { CompilerOptions } from "@inlang/paraglide-js";

/**
 * How the messages are compiled. The app compiles them into `src/paraglide`, and its tests into
 * a directory of their own, from the same settings.
 */
export const messages = {
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
} satisfies CompilerOptions;
