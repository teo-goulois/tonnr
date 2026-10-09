import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { APP_SLUG } from "@repo/config/app";
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
      domain,
      compatibility: {
        flags: ["nodejs_compat"],
      },
      env: {
        VITE_SERVER_URL: Config.String("VITE_SERVER_URL"),
        // The web app tells search engines to leave the stage out, unless this says "true".
        WEB_INDEXED: Config.String("WEB_INDEXED").pipe(Config.withDefault("false")),
      },
      dev: {
        port: 3001,
      },
    });

    // The admin app of decision 020 is a part of the stages that name a host for it, and of no
    // other: a stage without one deploys as it did before the admin existed. It is not started
    // by `alchemy dev` either: `pnpm run dev:admin` runs it.
    if (adminDomain === undefined) {
      return {
        web: webWorker.url,
      };
    }

    const adminWorker = yield* Cloudflare.Website.Vite("admin", {
      rootDir: "../../apps/admin",
      domain: adminDomain,
      compatibility: {
        flags: ["nodejs_compat"],
      },
      env: {
        VITE_SERVER_URL: Config.String("VITE_SERVER_URL"),
      },
    });

    return {
      web: webWorker.url,
      admin: adminWorker.url,
    };
  }),
);
