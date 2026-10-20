// What the commands that build `main` share: the deployments to Cloudflare (decision 021) and
// the releases of the app for phones (decision 075). Each builds what `main` holds on the remote,
// in a checkout of its own, so that work in progress in this checkout never goes online, and
// runs the code of other people with what their tools need of the shell and no secret of it.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// What the install and the builds keep of the shell: what their tools need to run. They run code
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

/** The variables of the shell that the tools keep, and those of `extra` besides. */
export const keptShell = (extra = []) =>
  Object.fromEntries(
    Object.entries(process.env).filter(([name]) =>
      [...KEPT, ...extra].some((kept) => kept.test(name)),
    ),
  );

export function fail(message) {
  console.error(message);
  process.exit(1);
}

/** A file of variables, read and never printed, or null when there is none. */
export function readEnvFile(file) {
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
// way the command counts as stopped. What goes on after ten seconds, or after a second signal,
// is ended.
function stop(signal) {
  if (stopped) return signalCommand("SIGKILL");
  stopped = true;
  if (signal === "SIGINT") setTimeout(() => signalCommand(signal), 1000).unref();
  else signalCommand(signal);
  setTimeout(() => signalCommand("SIGKILL"), 10_000).unref();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

export const isStopped = () => stopped;

/** Runs a command that a signal can stop. Says whether it succeeded, and what it wrote if kept. */
export function start(command, args, { keep = false, ...options }) {
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
export async function git(args, cwd = root) {
  const { ok, output, errors } = await start("git", args, { keep: true, cwd });
  if (!ok) throw new Error(stopped ? "Stopped." : `git ${args[0]} failed:\n${errors}`);
  return output;
}

/** Runs a step and says whether it succeeded. Its output goes to the terminal. */
export async function run(command, args, options) {
  const { ok, errors } = await start(command, args, options);
  if (errors) console.error(`${command}: ${errors}`);
  return ok;
}

/** The licence key of the icons, which their packages check when they install. */
export function licenceKey() {
  const key =
    readEnvFile(path.join(root, ".env"))?.NUCLEO_LICENSE_KEY ?? process.env.NUCLEO_LICENSE_KEY;
  if (!key) fail("NUCLEO_LICENSE_KEY is not set, in .env or in the shell: the install needs it.");
  return key;
}

/**
 * Checks out what `main` holds on the remote, in a directory of its own whose name starts with
 * `prefix`. Says where, which commit, and how that commit reads in the log.
 */
export async function checkoutMain(prefix) {
  // Into a ref of this run's own: FETCH_HEAD is shared, and someone else's fetch may write it
  // between two commands. The ref holds the commit until the checkout does.
  const fetched = `refs/${prefix}/${process.pid}`;
  const checkout = mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
  let refused = null;
  let commit = null;
  let summary = null;
  try {
    await git(["fetch", "--quiet", "--no-tags", "origin", `+refs/heads/main:${fetched}`]);
    await git(["worktree", "add", "--quiet", "--detach", checkout, fetched]);
    commit = await git(["rev-parse", fetched]);
    summary = await git(["log", "-1", "--format=%h %s", fetched]);
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
  return { checkout, commit, summary };
}

/** Removes a checkout once its command is done, or says where it stays. */
export async function removeCheckout(checkout, done) {
  try {
    await git(["worktree", "remove", "--force", checkout]);
  } catch (error) {
    fail(`${done}, and its checkout stays at ${checkout}: ${error.message}`);
  }
}

/** Says where the checkout of a command that stopped stays, and how to remove it. */
export function failKeeping(checkout, what) {
  fail(
    `\n${what} stopped. Its checkout stays at ${checkout}:\n` +
      `\`git worktree remove --force ${checkout}\` deletes it.`,
  );
}
