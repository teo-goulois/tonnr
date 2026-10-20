import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { APP_SLUG } from "@repo/config/app";
import { updatesBucketName } from "updates/bucket";
import "varlock/auto-load";

export default Alchemy.Stack(
  APP_SLUG,
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const dev = yield* Alchemy.ALCHEMY_DEV;
    const domain = Option.getOrUndefined(yield* Config.option(Config.String("WEB_DOMAIN")));
    const adminDomain = Option.getOrUndefined(yield* Config.option(Config.String("ADMIN_DOMAIN")));
    const updatesDomain = Option.getOrUndefined(
      yield* Config.option(Config.String("UPDATES_DOMAIN")),
    );
    const updatesFilesDomain = Option.getOrUndefined(
      yield* Config.option(Config.String("UPDATES_FILES_DOMAIN")),
    );
    // Other hosts of the web app, such as `www.` before its domain, which the Worker sends on to
    // `WEB_DOMAIN`: decision 021.
    const redirects = (yield* Config.String("WEB_REDIRECTS").pipe(Config.withDefault("")))
      .split(",")
      .map((host) => host.trim())
      .filter((host) => host !== "");

    // A stage is deployed with its values, by `pnpm run deploy:web <stage>`: decision 021.
    // Without them the web app would get the address of the local API, and an address on
    // another site than the API, where Safari refuses the session cookie.
    if (!dev && domain === undefined) {
      return yield* Effect.die(
        new Error("WEB_DOMAIN is not set. Deploy with `pnpm run deploy:web <stage>`."),
      );
    }

    const webWorker = yield* Cloudflare.Website.Vite("web", {
      rootDir: "../../apps/web",
      domain:
        domain === undefined || redirects.length === 0
          ? domain
          : { name: domain, aliases: redirects },
      compatibility: {
        flags: ["nodejs_compat"],
      },
      env: {
        VITE_SERVER_URL: Config.String("VITE_SERVER_URL"),
        VITE_POSTHOG_PROJECT_TOKEN: Config.String("VITE_POSTHOG_PROJECT_TOKEN").pipe(
          Config.withDefault(""),
        ),
        VITE_POSTHOG_HOST: Config.String("VITE_POSTHOG_HOST").pipe(Config.withDefault("")),
        VITE_POSTHOG_ENVIRONMENT: Config.String("VITE_POSTHOG_ENVIRONMENT").pipe(
          Config.withDefault(""),
        ),
        VITE_UMAMI_SCRIPT_URL: Config.String("VITE_UMAMI_SCRIPT_URL").pipe(Config.withDefault("")),
        VITE_UMAMI_WEBSITE_ID: Config.String("VITE_UMAMI_WEBSITE_ID").pipe(Config.withDefault("")),
        // The app's id in the App Store, which Safari's banner offers: decision 073.
        VITE_APP_STORE_ID: Config.String("VITE_APP_STORE_ID").pipe(Config.withDefault("")),
        // The web app tells search engines to leave the stage out, unless this says "true".
        WEB_INDEXED: Config.String("WEB_INDEXED").pipe(Config.withDefault("false")),
        WEB_DOMAIN: domain ?? "",
        WEB_REDIRECTS: redirects.join(","),
        // The apps for phones that open the stage's links, which the Worker names in the two
        // files a phone reads: the Apple team that signs the app for iPhones, and the
        // fingerprints of the keys that sign it for Android. Empty, it claims nothing: decision 073.
        APPLE_TEAM_ID: Config.String("APPLE_TEAM_ID").pipe(Config.withDefault("")),
        ANDROID_CERT_SHA256: Config.String("ANDROID_CERT_SHA256").pipe(Config.withDefault("")),
      },
      dev: {
        port: 3001,
      },
    });

    // The admin app of decision 020 is a part of the stages that name a host for it, and of no
    // other: a stage without one deploys as it did before the admin existed. It is not started
    // by `alchemy dev` either: `pnpm run dev:admin` runs it.
    const adminWorker =
      adminDomain === undefined
        ? undefined
        : yield* Cloudflare.Website.Vite("admin", {
            rootDir: "../../apps/admin",
            domain: adminDomain,
            compatibility: {
              flags: ["nodejs_compat"],
            },
            env: {
              VITE_SERVER_URL: Config.String("VITE_SERVER_URL"),
            },
          });

    // The updates of the app for phones, for a stage that names the Worker's host and the
    // bucket's: decision 075. The bucket's own domain serves the files of an update, each under
    // the key of its hash, from Cloudflare's cache; the Worker answers the apps from the bucket,
    // which it reads and never writes. It keeps no log of a request, and has no other address.
    const updates =
      updatesDomain === undefined || updatesFilesDomain === undefined
        ? undefined
        : yield* Effect.gen(function* () {
            const files = yield* Cloudflare.R2.Bucket("updates-files", {
              name: updatesBucketName(APP_SLUG, yield* Alchemy.Stage),
              domains: [{ name: updatesFilesDomain }],
            });
            return yield* Cloudflare.Worker("updates", {
              main: "../../apps/updates/src/worker.ts",
              domain: updatesDomain,
              workersDev: false,
              observability: { enabled: false },
              env: { BUCKET: files },
            });
          });

    return {
      web: webWorker.url,
      ...(adminWorker && { admin: adminWorker.url }),
      ...(updates && { updates: updates.url }),
    };
  }),
);
