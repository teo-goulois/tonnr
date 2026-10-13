import { serve } from "@hono/node-server";
import { pushKeyOf } from "@repo/api/push";

import { createApp } from "./app";
import { createAnalytics } from "./analytics";
import { ENV } from "./env.server";
import { readRevision } from "./revision";
import { auth, db, forecasts, places, usage, verification } from "./services";

// The moment the process started, which the migrations may have followed by minutes: the state
// of the instance shows it, to tell whether a deployment took.
const startedAt = new Date(Date.now() - process.uptime() * 1000);
// A push key that no browser could subscribe with stops the program here, and names itself.
const pushKey = await pushKeyOf(ENV);
const revision = readRevision();
const analytics = createAnalytics(ENV, revision);
const app = createApp({
  analytics,
  env: ENV,
  db,
  auth,
  usage,
  forecasts,
  places,
  verification,
  pushKey,
  startedAt,
  revision,
});

const server = serve(
  {
    fetch: app.fetch,
    port: ENV.PORT,
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  },
);

// A container is stopped with SIGTERM. Requests under way get five seconds to finish.
let stopping = false;
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;

    setTimeout(() => {
      console.error("Stopped with requests still under way");
      process.exit(1);
    }, 5000).unref();
    server.close(async () => {
      // The requests are answered: what they counted is written before the database is left.
      await usage.stop();
      await analytics?.stop().catch(() => {});
      await db.$client.end();
      process.exit(0);
    });
  });
}
