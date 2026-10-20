// Deploys one app of the Cloudflare stack for one stage: `pnpm run deploy:web dev`,
// `pnpm run deploy:admin dev` for the admin app of a stage that names a host for it, or
// `pnpm run deploy:updates dev` for the Worker and the bucket of the updates of the app for
// phones, of a stage that names their hosts (decision 075).
//
// It builds what `main` holds on the remote, in a checkout of its own, so that work in progress
// in this checkout never goes online. The access to Cloudflare comes from `packages/infra/.env`
// and the stage's values from `packages/infra/.env.<stage>`. Git ignores both, and neither is
// printed here. Decision 021 gives the reasons.
import path from "node:path";

import {
  checkoutMain,
  fail,
  failKeeping,
  keptShell,
  licenceKey,
  readEnvFile,
  removeCheckout,
  root,
  run,
} from "./lib/checkout.mjs";

const infra = path.join(root, "packages", "infra");

// The apps of the stack, by the name `packages/infra/alchemy.run.ts` gives each.
const APPS = ["web", "admin", "updates"];
// The value of a stage that gives each app its host name.
const DOMAINS = { web: "WEB_DOMAIN", admin: "ADMIN_DOMAIN", updates: "UPDATES_DOMAIN" };
const HOST_NAME = /^([a-z0-9-]+\.)+[a-z]{2,}$/;
const FLAGS = ["--yes", "--dry-run"];

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
if (!HOST_NAME.test(values.WEB_DOMAIN ?? "")) {
  faults.push(`WEB_DOMAIN in .env.${stage} is not a host name, such as dev.example.org`);
}
// The admin app is a part of a stage only when the stage names its host: decision 020.
if (app === "admin" && values.ADMIN_DOMAIN === undefined) {
  faults.push(`ADMIN_DOMAIN is not set in .env.${stage}: this stage has no admin app`);
} else if (values.ADMIN_DOMAIN !== undefined && !HOST_NAME.test(values.ADMIN_DOMAIN)) {
  faults.push(`ADMIN_DOMAIN in .env.${stage} is not a host name, such as admin.example.org`);
} else if (values.ADMIN_DOMAIN !== undefined && values.ADMIN_DOMAIN === values.WEB_DOMAIN) {
  faults.push(`ADMIN_DOMAIN in .env.${stage} is the web app's host name: the API tells them apart`);
}
// The updates of the app for phones are a part of a stage that names both their hosts: the
// Worker's, which every binary built for the stage asks for good, and the bucket's: decision 075.
const updatesHosts = [values.UPDATES_DOMAIN, values.UPDATES_FILES_DOMAIN];
if (app === "updates" && updatesHosts.some((host) => host === undefined)) {
  faults.push(
    `UPDATES_DOMAIN and UPDATES_FILES_DOMAIN are not both set in .env.${stage}: this stage has ` +
      "no updates",
  );
} else if (updatesHosts.some((host) => host !== undefined)) {
  if (updatesHosts.some((host) => !HOST_NAME.test(host ?? ""))) {
    faults.push(
      `UPDATES_DOMAIN and UPDATES_FILES_DOMAIN in .env.${stage} are not both host names, such ` +
        "as updates.example.org and bundles.example.org",
    );
  }
  const named = [values.WEB_DOMAIN, values.ADMIN_DOMAIN, ...updatesHosts].filter(Boolean);
  if (new Set(named).size !== named.length) {
    faults.push(`The host names of .env.${stage} are not all different from one another`);
  }
}
if (!URL.canParse(values.VITE_SERVER_URL ?? "") || !values.VITE_SERVER_URL.startsWith("https:")) {
  faults.push(`VITE_SERVER_URL in .env.${stage} is not an HTTPS address`);
}
if (!["true", "false", undefined].includes(values.WEB_INDEXED)) {
  faults.push(`WEB_INDEXED in .env.${stage} is neither "true" nor "false"`);
}
const redirects = (values.WEB_REDIRECTS ?? "").split(",").map((host) => host.trim());
if (
  redirects.some((host) => host !== "" && (!HOST_NAME.test(host) || host === values.WEB_DOMAIN))
) {
  faults.push(
    `WEB_REDIRECTS in .env.${stage} names something other than host names, or WEB_DOMAIN`,
  );
}
// The apps that open the stage's links, which the web app names to phones: decision 073.
if (values.APPLE_TEAM_ID && !/^[A-Z0-9]{10}$/.test(values.APPLE_TEAM_ID)) {
  faults.push(`APPLE_TEAM_ID in .env.${stage} is not an Apple team, ten capitals and digits`);
}
const fingerprints = (values.ANDROID_CERT_SHA256 ?? "").split(",").map((print) => print.trim());
if (
  values.ANDROID_CERT_SHA256 &&
  fingerprints.some((print) => !/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/i.test(print))
) {
  faults.push(
    `ANDROID_CERT_SHA256 in .env.${stage} is not SHA-256 fingerprints, such as 14:6D:…:E5, ` +
      "separated by commas",
  );
}
if (values.VITE_APP_STORE_ID && !/^\d+$/.test(values.VITE_APP_STORE_ID)) {
  faults.push(`VITE_APP_STORE_ID in .env.${stage} is not an id of the App Store, its digits alone`);
}
const analyticsValues = [
  "VITE_POSTHOG_PROJECT_TOKEN",
  "VITE_POSTHOG_HOST",
  "VITE_POSTHOG_ENVIRONMENT",
];
if (analyticsValues.some((name) => values[name])) {
  for (const name of analyticsValues)
    if (!values[name]) faults.push(`${name} is missing from .env.${stage}`);
  if (!["https://eu.i.posthog.com", "https://us.i.posthog.com"].includes(values.VITE_POSTHOG_HOST))
    faults.push("VITE_POSTHOG_HOST is not a PostHog Cloud ingestion host");
  if (!["development", "dev", "production"].includes(values.VITE_POSTHOG_ENVIRONMENT))
    faults.push("VITE_POSTHOG_ENVIRONMENT is not a known environment");
}
const audienceValues = ["VITE_UMAMI_SCRIPT_URL", "VITE_UMAMI_WEBSITE_ID"];
if (audienceValues.some((name) => values[name])) {
  for (const name of audienceValues)
    if (!values[name]) faults.push(`${name} is missing from .env.${stage}`);
}
if (faults.length > 0) fail(`packages/infra cannot deploy "${stage}":\n- ${faults.join("\n- ")}`);

// The icons check their licence when they install. The key is the root .env's, or the shell's.
const licence = licenceKey();

const { checkout, summary } = await checkoutMain("cloudflare-deploy");
console.log(`Deploying ${app} to "${stage}", at https://${values[DOMAINS[app]]}`);
console.log(`from ${summary}`);
console.log(`in ${checkout}\n`);

const shell = keptShell();
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
        WEB_REDIRECTS: values.WEB_REDIRECTS ?? "",
        APPLE_TEAM_ID: values.APPLE_TEAM_ID ?? "",
        ANDROID_CERT_SHA256: values.ANDROID_CERT_SHA256 ?? "",
        VITE_APP_STORE_ID: values.VITE_APP_STORE_ID ?? "",
        VITE_POSTHOG_PROJECT_TOKEN: values.VITE_POSTHOG_PROJECT_TOKEN ?? "",
        VITE_POSTHOG_HOST: values.VITE_POSTHOG_HOST ?? "",
        VITE_POSTHOG_ENVIRONMENT: values.VITE_POSTHOG_ENVIRONMENT ?? "",
        VITE_UMAMI_SCRIPT_URL: values.VITE_UMAMI_SCRIPT_URL ?? "",
        VITE_UMAMI_WEBSITE_ID: values.VITE_UMAMI_WEBSITE_ID ?? "",
        // The stack declares the admin app whenever the stage has one, whichever app is
        // deployed: a deployment of the web app alone must not find the admin gone from it.
        ...(values.ADMIN_DOMAIN !== undefined && { ADMIN_DOMAIN: values.ADMIN_DOMAIN }),
        // So are the updates of the app for phones.
        ...(values.UPDATES_DOMAIN !== undefined &&
          values.UPDATES_FILES_DOMAIN !== undefined && {
            UPDATES_DOMAIN: values.UPDATES_DOMAIN,
            UPDATES_FILES_DOMAIN: values.UPDATES_FILES_DOMAIN,
          }),
      },
    },
  ));

// What Alchemy wrote there may be what a second try needs.
if (!deployed) failKeeping(checkout, "The deployment");
await removeCheckout(checkout, "The deployment is done");
