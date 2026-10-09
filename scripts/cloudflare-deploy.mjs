// Deploys one app of the Cloudflare stack for one stage: `pnpm run deploy:web dev`.
//
// It builds what `main` holds on the remote, in a checkout of its own, so that work in progress
// in this checkout never goes online. The access to Cloudflare comes from `packages/infra/.env`
// and the stage's values from `packages/infra/.env.<stage>`. Git ignores both, and neither is
// printed here. Decision 021 gives the reasons.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const infra = path.join(root, "packages", "infra");

// The apps of the stack, by the name `packages/infra/alchemy.run.ts` gives each.
const APPS = ["web"];
const FLAGS = ["--yes", "--dry-run"];

// What the install and Alchemy keep of the shell: what their tools need to run. They run code
// that other people wrote, so a secret that happens to be exported in the shell stays here.
// Each variable is named: a family such as `MISE_*` holds a token.
const KEPT = [
  /^(PATH|HOME|USER|LOGNAME|SHELL|TMPDIR|TERM|COLORTERM|NO_COLOR|FORCE_COLOR|LANG|LC_\w+|TZ|CI)$/,
  // Where Node, pnpm and Alchemy are installed and keep their files.
  /^(PNPM_HOME|ALCHEMY_HOME|XDG_(CACHE|CONFIG|DATA|STATE)_HOME|XDG_RUNTIME_DIR)$/,
  /^(VOLTA_HOME|NVM_DIR|NVM_BIN|FNM_DIR|FNM_MULTISHELL_PATH|ASDF_DIR|ASDF_DATA_DIR)$/,
  /^MISE_(DATA|CONFIG|CACHE|STATE)_DIR$/,
  /^COREPACK_(HOME|ROOT|ENABLE_\w+|DEFAULT_TO_LATEST|NPM_REGISTRY)$/,
  /^(npm|pnpm)_config_(store_dir|registry)$/i,
  // How they reach the network.
  /^(HTTPS?_PROXY|NO_PROXY|https?_proxy|no_proxy|NODE_USE_ENV_PROXY|NODE_USE_SYSTEM_CA)$/,
  /^(NODE_OPTIONS|NODE_EXTRA_CA_CERTS|SSL_CERT_FILE)$/,
];

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readEnvFile(file) {
  if (!existsSync(file)) return null;
  return parseEnv(readFileSync(file, "utf8"));
}

// The command under way, and whether someone asked to stop.
let child = null;
let stopped = false;

/** A process, with those it started and those they started in turn. */
function family(pid) {
  const listed = spawnSync("ps", ["-axo", "pid=,ppid="], { encoding: "utf8" }).stdout ?? "";
  const pairs = listed.split("\n").map((line) => line.trim().split(/\s+/).map(Number));
  const found = [pid];
  for (const parent of found) {
    for (const [started, by] of pairs) if (by === parent) found.push(started);
  }
  return found;
}

function signalCommand(signal) {
  if (!child?.pid) return;
  for (const pid of family(child.pid).reverse()) {
    try {
      process.kill(pid, signal);
    } catch {
      // It has stopped already.
    }
  }
}

// Ctrl+C reaches the command by itself, since the terminal sends it to both. A signal sent to
// this process alone does not, so it is passed on, to what the command started as well. Either
// way the deployment counts as stopped. What goes on after ten seconds, or after a second
// signal, is ended.
function stop(signal) {
  if (stopped) return signalCommand("SIGKILL");
  stopped = true;
  if (signal === "SIGINT") setTimeout(() => signalCommand(signal), 1000).unref();
  else signalCommand(signal);
  setTimeout(() => signalCommand("SIGKILL"), 10_000).unref();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

/** Runs a command that a signal can stop. Says whether it succeeded, and what it wrote if kept. */
function start(command, args, { keep = false, ...options }) {
  return new Promise((resolve) => {
    if (stopped) return resolve({ ok: false, output: "", errors: "" });
    child = spawn(command, args, {
      stdio: keep ? ["ignore", "pipe", "pipe"] : "inherit",
      ...options,
    });
    let output = "";
    let errors = "";
    child.stdout?.on("data", (chunk) => (output += chunk));
    child.stderr?.on("data", (chunk) => (errors += chunk));
    child.on("error", (error) => {
      child = null;
      resolve({ ok: false, output, errors: `it could not start: ${error.message}` });
    });
    child.on("close", (code) => {
      child = null;
      resolve({ ok: code === 0 && !stopped, output: output.trim(), errors: errors.trim() });
    });
  });
}

// Git is the developer's own, and reaches the remote as they do: it keeps the shell as it is.
async function git(args) {
  const { ok, output, errors } = await start("git", args, { keep: true, cwd: root });
  if (!ok) throw new Error(stopped ? "Stopped." : `git ${args[0]} failed:\n${errors}`);
  return output;
}

/** Runs a step of the deployment and says whether it succeeded. Its output goes to the terminal. */
async function run(command, args, options) {
  const { ok, errors } = await start(command, args, options);
  if (errors) console.error(`${command}: ${errors}`);
  return ok;
}

const [app, stage, ...flags] = process.argv.slice(2);
if (
  !APPS.includes(app) ||
  !/^[a-z0-9][a-z0-9_-]*$/.test(stage ?? "") ||
  flags.some((flag) => !FLAGS.includes(flag))
) {
  fail(`Usage: cloudflare-deploy <${APPS.join("|")}> <stage> [--dry-run] [--yes]`);
}

const access = readEnvFile(path.join(infra, ".env"));
if (!access) fail("packages/infra/.env is missing. packages/infra/.env.example shows it.");
const values = readEnvFile(path.join(infra, `.env.${stage}`));
if (!values) {
  fail(`packages/infra/.env.${stage} is missing: the stage "${stage}" has no values here.`);
}

const faults = [];
if (!access.CLOUDFLARE_API_TOKEN) faults.push("CLOUDFLARE_API_TOKEN is not set in .env");
if (!/^[0-9a-f]{32}$/.test(access.CLOUDFLARE_ACCOUNT_ID ?? "")) {
  faults.push("CLOUDFLARE_ACCOUNT_ID in .env is not an account id, 32 characters from 0-9a-f");
}
if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(values.WEB_DOMAIN ?? "")) {
  faults.push(`WEB_DOMAIN in .env.${stage} is not a host name, such as dev.example.org`);
}
if (!URL.canParse(values.VITE_SERVER_URL ?? "") || !values.VITE_SERVER_URL.startsWith("https:")) {
  faults.push(`VITE_SERVER_URL in .env.${stage} is not an HTTPS address`);
}
if (!["true", "false", undefined].includes(values.WEB_INDEXED)) {
  faults.push(`WEB_INDEXED in .env.${stage} is neither "true" nor "false"`);
}
if (faults.length > 0) fail(`packages/infra cannot deploy "${stage}":\n- ${faults.join("\n- ")}`);

// The icons check their licence when they install. The key is the root .env's, or the shell's.
const licence =
  readEnvFile(path.join(root, ".env"))?.NUCLEO_LICENSE_KEY ?? process.env.NUCLEO_LICENSE_KEY;
if (!licence) fail("NUCLEO_LICENSE_KEY is not set, in .env or in the shell: the install needs it.");

// Into a ref of this run's own: FETCH_HEAD is shared, and someone else's fetch may write it
// between two commands. The ref holds the commit until the checkout does.
const fetched = `refs/cloudflare-deploy/${process.pid}`;
const checkout = mkdtempSync(path.join(os.tmpdir(), "cloudflare-deploy-"));
let refused = null;
try {
  await git(["fetch", "--quiet", "--no-tags", "origin", `+refs/heads/main:${fetched}`]);
  await git(["worktree", "add", "--quiet", "--detach", checkout, fetched]);
  console.log(`Deploying ${app} to "${stage}", at https://${values.WEB_DOMAIN}`);
  console.log(`from ${await git(["log", "-1", "--format=%h %s", fetched])}`);
  console.log(`in ${checkout}\n`);
} catch (error) {
  refused = error.message;
}
spawnSync("git", ["update-ref", "-d", fetched], { cwd: root });
if (refused) {
  // Nothing was built there, so nothing of it is worth keeping.
  spawnSync("git", ["worktree", "remove", "--force", checkout], { cwd: root });
  rmSync(checkout, { recursive: true, force: true });
  fail(refused);
}

const shell = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => KEPT.some((kept) => kept.test(name))),
);
// A dry run answers no question, so it never makes or changes the state store. `--yes` would.
const answers = flags.includes("--dry-run") ? ["--no-input", "--dry-run"] : flags;

// Each of the two gets the secret it needs and no other.
const deployed =
  (await run("pnpm", ["install", "--frozen-lockfile"], {
    cwd: checkout,
    env: { ...shell, NUCLEO_LICENSE_KEY: licence },
  })) &&
  (await run(
    "pnpm",
    ["exec", "alchemy", "deploy", "--stage", stage, "--include", app, ...answers],
    {
      cwd: path.join(checkout, "packages", "infra"),
      env: {
        ...shell,
        CLOUDFLARE_API_TOKEN: access.CLOUDFLARE_API_TOKEN,
        CLOUDFLARE_ACCOUNT_ID: access.CLOUDFLARE_ACCOUNT_ID,
        WEB_DOMAIN: values.WEB_DOMAIN,
        VITE_SERVER_URL: values.VITE_SERVER_URL,
        WEB_INDEXED: values.WEB_INDEXED ?? "false",
      },
    },
  ));

if (!deployed) {
  // What Alchemy wrote there may be what a second try needs.
  fail(
    `\nThe deployment stopped. Its checkout stays at ${checkout}:\n` +
      `\`git worktree remove --force ${checkout}\` deletes it.`,
  );
}
try {
  await git(["worktree", "remove", "--force", checkout]);
} catch (error) {
  fail(`The deployment is done, and its checkout stays at ${checkout}: ${error.message}`);
}
