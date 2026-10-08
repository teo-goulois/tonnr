// Temporary: serves the built app through a Cloudflare quick tunnel, so it can be looked at
// from another device. Delete this file and the "demo" scripts once a real deployment exists.
//
// Needs Postgres running (`pnpm run db:start`) and `cloudflared` on the PATH.
// `pnpm run demo` starts it and Ctrl+C stops it. `pnpm run demo:reload` rebuilds and restarts
// the app behind the same address, which only changes when this script itself restarts.
import { spawn } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { pipeline } from "node:stream";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PID_FILE = path.join(root, ".demo.pid");
const PROXY_PORT = 8787;
const API_PORT = 3000;
const WEB_PORT = 3001;
// The demo's own web build, so that `pnpm run check` and `pnpm run build` do not replace it.
const WEB_BUILD = ".demo-dist";
// The API owns these paths. Everything else is the web app.
const API_PATHS = ["/rpc", "/v1", "/api/auth"];

const children = new Set();
// The API, the worker, and the web app: the programs a reload restarts.
let apps = [];
let stopping = false;

function run(name, command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd ?? root,
    env: { ...process.env, ...options.env },
    stdio: ["ignore", "pipe", "pipe"],
    // Its own process group, so stopping it also stops the processes it starts.
    detached: true,
  });
  children.add(child);
  // A program that cannot start, or that fails, must not leave the others running behind.
  child.on("error", (error) => {
    console.error(`[${name}] could not start: ${error.message}`);
    stop();
    process.exit(1);
  });
  child.on("exit", (code) => {
    children.delete(child);
    // A program stopped by a signal was stopped on purpose, here or by a reload.
    if (stopping || code === 0 || code === null) return;
    console.error(`[${name}] exited with code ${code}`);
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

function exited(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) resolve();
    else child.on("exit", resolve);
  });
}

function finished(child, name) {
  return new Promise((resolve, reject) => {
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${name} exited with code ${code}`)),
    );
  });
}

function signal(child) {
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    // It had already exited.
  }
}

function stop() {
  stopping = true;
  for (const child of children) signal(child);
  rmSync(PID_FILE, { force: true });
}

for (const name of ["SIGINT", "SIGTERM"]) {
  process.on(name, () => {
    stop();
    // The tunnel takes a moment to close its connection.
    setTimeout(() => process.exit(0), 3000);
  });
}

async function build(publicUrl) {
  await finished(
    run("build", "pnpm", ["exec", "turbo", "run", "build", "-F", "server", "-F", "worker"]),
    "build",
  );
  // The public address is baked into the web build.
  await finished(
    run("build", "pnpm", ["exec", "vite", "build", "--outDir", WEB_BUILD], {
      cwd: path.join(root, "apps/web"),
      env: { VITE_SERVER_URL: publicUrl },
    }),
    "web build",
  );
}

function startApps(publicUrl) {
  apps = [
    run("api", "node", ["dist/index.mjs"], {
      cwd: path.join(root, "apps/server"),
      env: { BETTER_AUTH_URL: publicUrl, CORS_ORIGIN: publicUrl, PORT: String(API_PORT) },
    }),
    run("worker", "node", ["dist/index.mjs"], { cwd: path.join(root, "apps/worker") }),
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
    ),
  ];
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
      response.end("The app is starting. Reload in a few seconds.");
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

  await build(publicUrl);
  startApps(publicUrl);
  writeFileSync(PID_FILE, String(process.pid));
  console.log(`\nThe app is at ${publicUrl}\n`);

  let reloading = false;
  process.on("SIGHUP", async () => {
    if (reloading || stopping) return;
    reloading = true;
    console.log("\nReloading…\n");
    try {
      // Build while the old version still answers, then swap.
      await build(publicUrl);
      const previous = apps;
      for (const child of previous) signal(child);
      await Promise.all(previous.map(exited));
      startApps(publicUrl);
      console.log(`\nReloaded. The app is still at ${publicUrl}\n`);
    } catch (error) {
      console.error(error);
      stop();
      process.exit(1);
    } finally {
      reloading = false;
    }
  });
} catch (error) {
  console.error(error);
  stop();
  process.exit(1);
}
