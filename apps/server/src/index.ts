import { serve } from "@hono/node-server";

import { createApp } from "./app";
import { ENV } from "./env.server";
import { auth, db, usage } from "./services";

const app = createApp({ env: ENV, db, auth, usage });

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
      await db.$client.end();
      process.exit(0);
    });
  });
}
