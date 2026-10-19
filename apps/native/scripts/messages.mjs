// Compiles the web app's messages for the app for phones, so that each string stays in one
// place, `apps/web/messages/`, in its four languages: decision 069. The app sets its language
// itself, from what it was set to or the phone's, so the locale lives in a global variable.
import { compile } from "@inlang/paraglide-js";

await compile({
  project: "../web/project.inlang",
  outdir: "./src/paraglide",
  strategy: ["globalVariable", "baseLocale"],
  outputStructure: "locale-modules",
  isServer: "false",
  emitGitIgnore: false,
  emitPrettierIgnore: false,
  emitReadme: false,
});
