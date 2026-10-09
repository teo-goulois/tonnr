import { serve } from "@hono/node-server";

import { createApp } from "./app";
import { ENV } from "./env.server";
import { auth, db } from "./services";

const app = createApp({ env: ENV, db, auth });

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
      await db.$client.end();
      process.exit(0);
    });
  });
}
