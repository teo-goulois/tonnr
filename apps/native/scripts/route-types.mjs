// Writes the types of expo-router's routes into .expo/types, as `expo start` writes them, so that
// the type check reads the same routes whether Metro ran on this machine or not: without them a
// route is any string, with them only a route the app has. Run by `check-types` (decision 069).
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const app = new URL("..", import.meta.url).pathname;
// The generator runs in Node, where Metro's compilation does not say where the routes are, and
// reads it as it loads.
process.env.EXPO_ROUTER_APP_ROOT = join(app, "src/app");
const require = createRequire(import.meta.url);
const routes = require(
  require.resolve("@expo/router-server/build/typed-routes", {
    paths: [require.resolve("expo-router/package.json")],
  }),
);
const types = join(app, ".expo/types");
mkdirSync(types, { recursive: true });
// Debounced: Node waits for it before it exits.
routes.regenerateDeclarations(types);
