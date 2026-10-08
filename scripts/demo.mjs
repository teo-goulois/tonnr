// Temporary: serves the built app through a Cloudflare quick tunnel, so it can be looked at
// from another device. Delete this file and the "demo" script once a real deployment exists.
//
// Needs Postgres running (`pnpm run db:start`) and `cloudflared` on the PATH.
// Run it with `pnpm run demo`, stop it with Ctrl+C.
import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { pipeline } from "node:stream";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PROXY_PORT = 8787;
const API_PORT = 3000;
const WEB_PORT = 3001;
// The demo's own web build, so that `pnpm run check` and `pnpm run build` do not replace it.
const WEB_BUILD = ".demo-dist";
// The API owns these paths. Everything else is the web app.
const API_PATHS = ["/rpc", "/v1", "/api/auth"];

const children = [];

function run(name, command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd ?? root,
    env: { ...process.env, ...options.env },
    stdio: ["ignore", "pipe", "pipe"],
    // Its own process group, so stopping it also stops the processes it starts.
    detached: true,
  });
  children.push(child);
  // A program that cannot start must not leave the ones already running behind.
  child.on("error", (error) => {
    console.error(`[${name}] could not start: ${error.message}`);
    stop();
    process.exit(1);
  });
  for (const stream of [child.stdout, child.stderr]) {
    stream.on("data", (chunk) => {
      options.onOutput?.(String(chunk));
      for (const line of String(chunk).split("\n")) {
        if (line.trim()) console.log(`[${name}] ${line}`);
      }
    });
  }
  return child;
}

function finished(child, name) {
  return new Promise((resolve, reject) => {
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${name} exited with code ${code}`)),
    );
  });
}

function stop() {
  for (const child of children) {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      // It had already exited.
    }
  }
}
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stop();
    // The tunnel takes a moment to close its connection.
    setTimeout(() => process.exit(0), 3000);
  });
}

// One origin for the browser: the tunnel reaches this proxy, which splits by path.
http
  .createServer((request, response) => {
    const url = request.url ?? "/";
    const isApi = API_PATHS.some(
      (prefix) => url === prefix || url.startsWith(`${prefix}/`) || url.startsWith(`${prefix}?`),
    );
    const port = isApi ? API_PORT : WEB_PORT;

    const upstream = http.request(
      {
        host: "127.0.0.1",
        port,
        path: url,
        method: request.method,
        headers: {
          ...request.headers,
          host: `localhost:${port}`,
          "x-forwarded-host": request.headers.host ?? "",
          "x-forwarded-proto": "https",
        },
      },
      (answer) => {
        response.writeHead(answer.statusCode ?? 502, answer.headers);
        // An answer cut short closes the browser's connection too, instead of leaving it waiting.
        pipeline(answer, response, (error) => {
          if (error) response.destroy();
        });
      },
    );
    upstream.on("error", () => {
      response.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
      response.end("The app is still starting. Reload in a few seconds.");
    });
    request.pipe(upstream);
  })
  .listen(PROXY_PORT, "127.0.0.1");

try {
  // The tunnel comes first: its address is baked into the web build.
  const publicUrl = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("cloudflared gave no address")), 60_000);
    run(
      "tunnel",
      "cloudflared",
      ["tunnel", "--no-autoupdate", "--url", `http://127.0.0.1:${PROXY_PORT}`],
      {
        onOutput: (text) => {
          const match = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(text);
          if (match) {
            clearTimeout(timeout);
            resolve(match[0]);
          }
        },
      },
    );
  });
  console.log(`\nPublic address: ${publicUrl}\nBuilding…\n`);

  await finished(
    run("build", "pnpm", ["exec", "turbo", "run", "build", "-F", "server", "-F", "worker"]),
    "build",
  );
  await finished(
    run("build", "pnpm", ["exec", "vite", "build", "--outDir", WEB_BUILD], {
      cwd: path.join(root, "apps/web"),
      env: { VITE_SERVER_URL: publicUrl },
    }),
    "web build",
  );

  const apiEnv = { BETTER_AUTH_URL: publicUrl, CORS_ORIGIN: publicUrl };
  run("api", "node", ["dist/index.mjs"], { cwd: path.join(root, "apps/server"), env: apiEnv });
  run("worker", "node", ["dist/index.mjs"], { cwd: path.join(root, "apps/worker") });
  run(
    "web",
    "pnpm",
    [
      "exec",
      "vite",
      "preview",
      "--outDir",
      WEB_BUILD,
      "--host",
      "127.0.0.1",
      "--port",
      String(WEB_PORT),
      "--strictPort",
    ],
    { cwd: path.join(root, "apps/web") },
  );

  console.log(`\nThe app is at ${publicUrl}\n`);
} catch (error) {
  console.error(error);
  stop();
  process.exit(1);
}
