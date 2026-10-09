// Deploys one app of the Cloudflare stack for one stage: `pnpm run deploy:web dev`.
//
// It builds what `main` holds on the remote, in a checkout of its own, so that work in progress
// in this checkout never goes online. The access to Cloudflare comes from `packages/infra/.env`
// and the stage's values from `packages/infra/.env.<stage>`. Git ignores both, and neither is
// printed here. Decision 021 gives the reasons.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const infra = path.join(root, "packages", "infra");

// The apps of the stack, by the name `packages/infra/alchemy.run.ts` gives each.
const APPS = ["web"];
const FLAGS = ["--yes", "--dry-run"];

// What a child process keeps of the shell: what its tools need to run. A secret that happens to
// be exported there stays here.
const KEPT =
  /^(PATH|HOME|USER|LOGNAME|SHELL|TMPDIR|TERM|COLORTERM|NO_COLOR|FORCE_COLOR|LANG|LC_\w+|TZ|CI|PNPM_HOME|COREPACK_\w+|XDG_\w+|ALCHEMY_HOME|HTTPS?_PROXY|NO_PROXY|https?_proxy|no_proxy|NODE_EXTRA_CA_CERTS|SSL_CERT_FILE)$/;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readEnvFile(file) {
  if (!existsSync(file)) return null;
  return parseEnv(readFileSync(file, "utf8"));
}

/** Runs a step of the deployment and says whether it succeeded. Its output goes to the terminal. */
function run(command, args, options) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.error) console.error(`${command} could not start: ${result.error.message}`);
  return result.status === 0;
}

function git(args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) fail(`git ${args[0]} failed:\n${result.stderr.trim()}`);
  return result.stdout.trim();
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
// between two commands.
const fetched = `refs/cloudflare-deploy/${process.pid}`;
git(["fetch", "--quiet", "--no-tags", "origin", `+refs/heads/main:${fetched}`]);
const commit = git(["rev-parse", fetched]);
git(["update-ref", "-d", fetched]);

const checkout = mkdtempSync(path.join(os.tmpdir(), "cloudflare-deploy-"));
git(["worktree", "add", "--quiet", "--detach", checkout, commit]);
console.log(`Deploying ${app} to "${stage}", at https://${values.WEB_DOMAIN}`);
console.log(`from ${git(["log", "-1", "--format=%h %s", commit])}`);
console.log(`in ${checkout}\n`);

// Ctrl+C stops the step under way, which then counts as failed, so that the lines below say
// what is left behind.
process.on("SIGINT", () => {});
process.on("SIGTERM", () => {});

const shell = Object.fromEntries(Object.entries(process.env).filter(([name]) => KEPT.test(name)));
// A dry run answers no question, so it never makes or changes the state store. `--yes` would.
const answers = flags.includes("--dry-run") ? ["--no-input", "--dry-run"] : flags;

// Each step gets the secret it needs and no other.
const deployed =
  run("pnpm", ["install", "--frozen-lockfile"], {
    cwd: checkout,
    env: { ...shell, NUCLEO_LICENSE_KEY: licence },
  }) &&
  run("pnpm", ["exec", "alchemy", "deploy", "--stage", stage, "--include", app, ...answers], {
    cwd: path.join(checkout, "packages", "infra"),
    env: {
      ...shell,
      CLOUDFLARE_API_TOKEN: access.CLOUDFLARE_API_TOKEN,
      CLOUDFLARE_ACCOUNT_ID: access.CLOUDFLARE_ACCOUNT_ID,
      WEB_DOMAIN: values.WEB_DOMAIN,
      VITE_SERVER_URL: values.VITE_SERVER_URL,
      WEB_INDEXED: values.WEB_INDEXED ?? "false",
    },
  });

if (!deployed) {
  // What Alchemy wrote there may be what a second try needs.
  fail(
    `\nThe deployment stopped. Its checkout stays at ${checkout}:\n` +
      `\`git worktree remove --force ${checkout}\` deletes it.`,
  );
}
git(["worktree", "remove", "--force", checkout]);
