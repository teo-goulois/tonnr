// Asks Easypanel to build and restart one service of an instance, then waits until the new one
// has started: `pnpm run deploy:api`, or `pnpm run deploy:worker`. `pnpm run deploy:status` asks
// nothing of Easypanel, and says since when the API and the worker run.
//
// Easypanel gives each service a deploy address, under "Deployments". Whoever knows it can deploy
// the service, so it lives in the root `.env`, which Git ignores, and is never printed here.
//
// Easypanel swaps a container with no outage, and a build that fails leaves the old one
// answering: the API's own address does not tell a deployment that took from one that did not.
// The API's health does: it says when the API started, and when the worker that started last
// did (decision 022). The command reads it before it asks, and waits for a later start.
// `DEPLOYED_API_URL` names the API to read it from. Without it the command asks and does not
// wait, and so it does with `--no-wait`.

const ADDRESSES = {
  api: "EASYPANEL_API_DEPLOY_URL",
  worker: "EASYPANEL_WORKER_DEPLOY_URL",
};
// How long a build and a start may take, and how often the health is read meanwhile.
const WAIT_MS = 10 * 60 * 1000;
const EVERY_MS = 10 * 1000;

const [service, ...flags] = process.argv.slice(2);
const waits = !flags.includes("--no-wait");
const api = process.env.DEPLOYED_API_URL?.replace(/\/$/, "");

/** The API's health, or null when it could not be read: an API from before it had one. */
async function readHealth() {
  if (!api) return null;
  try {
    const response = await fetch(`${api}/v1/health`, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) return null;
    const health = await response.json();
    const time = (value) => (value ? new Date(value).getTime() : null);
    return {
      at: time(health.at),
      api: time(health.api.startedAt),
      worker: health.worker && {
        startedAt: time(health.worker.startedAt),
        readyAt: time(health.worker.readyAt),
        running: health.worker.running,
      },
    };
  } catch {
    return null;
  }
}

function ago(from, to) {
  const seconds = Math.max(0, Math.round((to - from) / 1000));
  if (seconds < 90) return `${seconds} s ago`;
  if (seconds < 90 * 60) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 36 * 3600) return `${Math.round(seconds / 3600)} h ago`;
  return `${Math.round(seconds / 86_400)} days ago`;
}

function describe(health) {
  const lines = [`The API started ${ago(health.api, health.at)}.`];
  if (!health.worker) lines.push("No worker ever started.");
  else {
    const { startedAt, readyAt, running } = health.worker;
    lines.push(
      `The worker that started last did ${ago(startedAt, health.at)}: ` +
        (readyAt === null ? "it has not scheduled its queues, " : "it scheduled its queues, ") +
        (running ? "and it runs." : "and it was not seen in the last two minutes."),
    );
  }
  return lines.join("\n");
}

if (service === "status") {
  if (!api) {
    console.error("DEPLOYED_API_URL is not set. Name the deployed API's address in .env.");
    process.exit(1);
  }
  const health = await readHealth();
  if (!health) {
    console.error(`${api}/v1/health did not answer: the API is down, or from before it had one.`);
    process.exit(1);
  }
  console.log(describe(health));
  process.exit(0);
}

const variable = ADDRESSES[service];
if (!variable) {
  console.error(`Usage: easypanel-deploy <${Object.keys(ADDRESSES).join("|")}|status> [--no-wait]`);
  process.exit(1);
}

const address = process.env[variable];
if (!address) {
  console.error(
    `${variable} is not set. Copy the service's deploy address from Easypanel to .env.`,
  );
  process.exit(1);
}

// What runs before the deployment is asked for: a later start is the deployment's.
const before = waits ? await readHealth() : null;

let response;
try {
  response = await fetch(address, { method: "POST", signal: AbortSignal.timeout(30_000) });
} catch (error) {
  // The error's own message may quote the address.
  console.error(`Easypanel could not be reached: ${error.cause?.code ?? error.name}`);
  process.exit(1);
}

if (!response.ok) {
  console.error(`Easypanel refused to deploy the ${service}: it answered ${response.status}.`);
  process.exit(1);
}
console.log(`Easypanel is deploying the ${service}. The build takes a few minutes.`);

if (!waits || !api) {
  if (waits) console.log("DEPLOYED_API_URL is not set: nothing here says whether it took.");
  process.exit(0);
}
// The worker's start is read through the API: one that does not answer its health, as one from
// before it had any, tells nothing of the worker.
if (service === "worker" && before === null) {
  console.log(`${api}/v1/health did not answer: nothing here says whether it took.`);
  process.exit(0);
}

/** Whether what runs now started after the deployment was asked for. */
function took(now) {
  if (service === "api") {
    // An API that had no health to read and has one now is the new one.
    return before === null || now.api > before.api;
  }
  const last = before?.worker?.startedAt ?? 0;
  const { worker } = now;
  return Boolean(worker && worker.startedAt > last && worker.readyAt && worker.running);
}

const asked = Date.now();
while (Date.now() - asked < WAIT_MS) {
  await new Promise((resolve) => setTimeout(resolve, EVERY_MS));
  const now = await readHealth();
  if (now && took(now)) {
    const waited = Math.round((Date.now() - asked) / 1000);
    console.log(`The new ${service} runs, ${waited} s after it was asked for.\n${describe(now)}`);
    process.exit(0);
  }
}
console.error(
  `No new ${service} started in ${WAIT_MS / 60_000} minutes. Its build may have failed, which ` +
    "leaves the one before running: Easypanel's page of the service says.",
);
process.exit(1);
