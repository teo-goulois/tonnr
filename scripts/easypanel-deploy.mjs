// Asks Easypanel to build and restart one service of an instance: `pnpm run deploy:api`, or
// `pnpm run deploy:worker`.
//
// Easypanel gives each service a deploy address, under "Deployments". Whoever knows it can deploy
// the service, so it lives in the root `.env`, which Git ignores, and is never printed here.

const ADDRESSES = {
  api: "EASYPANEL_API_DEPLOY_URL",
  worker: "EASYPANEL_WORKER_DEPLOY_URL",
};

const service = process.argv[2];
const variable = ADDRESSES[service];
if (!variable) {
  console.error(`Usage: easypanel-deploy <${Object.keys(ADDRESSES).join("|")}>`);
  process.exit(1);
}

const address = process.env[variable];
if (!address) {
  console.error(
    `${variable} is not set. Copy the service's deploy address from Easypanel to .env.`,
  );
  process.exit(1);
}

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
