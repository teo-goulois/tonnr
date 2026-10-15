import {
  makeVapidKeys,
  testForecasts,
  testPlaces,
  testReceiver,
  testVerification,
} from "@repo/api/testing";
import { createUsage, type Usage } from "@repo/api/usage";
import { createAuth } from "@repo/auth";
import { suspensionHooks } from "@repo/auth/suspension";
import { providerCalls } from "@repo/db/schema/forecasts";
import { createEmailVerificationToken } from "better-auth/api";
import {
  accountSuspension,
  apiKey,
  apiUsage,
  developer,
  operator,
  removedUsername,
  visitorClosure,
} from "@repo/db/schema/access";
import { alertSettings, pushSubscription } from "@repo/db/schema/alerts";
import { oauthConsent, session, user } from "@repo/db/schema/auth";
import { sponsorship } from "@repo/db/schema/community";
import { stationList } from "@repo/db/schema/lists";
import { createTestDatabase, TEST_DATABASE_URL } from "@repo/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "./app";

const API = "http://localhost:3000";
const APP = "http://localhost:3001";
const ADMIN = "http://localhost:3002";
const ELSEWHERE = "https://elsewhere.example";
const NOT_CACHED = "private, no-store";

type By = {
  cookie?: string;
  key?: string;
  origin?: string;
  referer?: string;
  // What the request asks for as a language, in `Accept-Language`.
  language?: string;
  body?: unknown;
};
type Mailing = NonNullable<Parameters<typeof testVerification>[1]>;
type MadeKey = { id: string; key: string; developerId: string };
type Spec = {
  components: { securitySchemes: Record<string, unknown> };
  security: unknown;
  paths: Record<string, Record<string, { security?: unknown }>>;
};

// An answer's body, read as what the route is known to give.
const bodyOf = async <Body>(response: Response) => (await response.json()) as Body;

describe.skipIf(!TEST_DATABASE_URL)("the API over HTTP", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let usage: Usage;
  // No test asks the forecast provider: a function stands for it.
  const { forecasts } = testForecasts();
  // An instance with an admin app, and one without.
  let app: ReturnType<typeof createApp>;
  let bare: ReturnType<typeof createApp>;
  let logged: ReturnType<typeof vi.spyOn>;

  const env = {
    BETTER_AUTH_URL: API,
    BETTER_AUTH_SECRET: "made-up-for-these-tests-and-long-enough",
    CORS_ORIGIN: APP,
  };

  /**
   * An API with these settings. It sends no mail unless told to: its mail is then kept in
   * memory, and `sent` and `link` say what left.
   */
  function make(
    settings: typeof env & { ADMIN_ORIGIN?: string },
    mailing: Mailing = { on: false },
    // The search of places asks no service: a test gives the one whose answers it sets.
    places = testPlaces().places,
    // The public key of an instance that sends push.
    pushKey?: string,
  ) {
    const { db } = database;
    const mail = testVerification(db, { ...mailing, settings });
    const auth = createAuth(settings, db, [], mail.verification);
    const made = createApp({
      env: settings,
      db,
      auth,
      usage,
      forecasts,
      places,
      verification: mail.verification,
      pushKey,
    });
    return { app: made, ...mail };
  }

  beforeAll(async () => {
    database = await createTestDatabase();
    const { db } = database;
    // Counted in memory, and written only when a test asks.
    usage = createUsage(db, { every: null });
    app = make({ ...env, ADMIN_ORIGIN: ADMIN }).app;
    bare = make(env).app;
    // The app logs each request, and each fault as an error.
    logged = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await database?.drop();
  });
  beforeEach(async () => {
    await database.db.delete(apiUsage);
    await database.db.delete(developer);
    await database.db.delete(user);
    await database.db.delete(removedUsername);
    // An instance answers the visitors of its web app until an operator closes it to them.
    await database.db.delete(visitorClosure);
  });

  function send(method: string, path: string, by: By = {}, to = app) {
    const headers = new Headers();
    if (by.cookie) headers.set("Cookie", by.cookie);
    if (by.key) headers.set("Authorization", `Bearer ${by.key}`);
    if (by.origin) headers.set("Origin", by.origin);
    if (by.referer) headers.set("Referer", by.referer);
    if (by.language) headers.set("Accept-Language", by.language);
    if (by.body === undefined) return to.request(path, { method, headers });

    headers.set("Content-Type", "application/json");
    return to.request(path, { method, headers, body: JSON.stringify(by.body) });
  }

  /** Creates an account and gives its session's cookie. */
  async function signUp(name: string) {
    const account = { name, email: `${name}@example.org`, password: "made-up-for-these-tests" };
    const response = await send("POST", "/api/auth/sign-up/email", { origin: APP, body: account });
    expect(response.status).toBe(200);
    return response.headers
      .getSetCookie()
      .map((set) => set.split(";")[0])
      .join("; ");
  }

  /** An account that runs the instance, with its session's cookie. */
  async function signUpOperator() {
    const cookie = await signUp("owner");
    const account = await bodyOf<{ id: string }>(await send("GET", "/v1/account", { cookie }));
    await database.db.insert(operator).values({ userId: account.id });
    return cookie;
  }

  const keys = () => database.db.select().from(apiKey);
  const lists = () => database.db.select().from(stationList);

  /** A developer account, made from the admin's site. Its id. */
  async function makeDeveloper(cookie: string, body: object = { name: "a developer" }) {
    const made = await send("POST", "/v1/developers", { cookie, origin: ADMIN, body });
    expect(made.status).toBe(201);
    return (await bodyOf<{ id: string }>(made)).id;
  }

  /** A key of a developer account made for it, from the admin's site. */
  async function makeKey(cookie: string, developerId?: string) {
    const body = { name: "a program", developerId: developerId ?? (await makeDeveloper(cookie)) };
    const made = await send("POST", "/v1/keys", { cookie, origin: ADMIN, body });
    expect([made.status, made.headers.get("Cache-Control")]).toEqual([201, NOT_CACHED]);
    return bodyOf<MadeKey>(made);
  }

  it("answers the health check and the reference to anyone", async () => {
    const health = await send("GET", "/");
    expect([health.status, await health.text()]).toEqual([200, "OK"]);
    expect((await send("GET", "/v1/openapi.json")).status).toBe(200);
    expect((await send("GET", "/v1/docs")).status).toBe(200);
  });

  it.each([
    "/v1/stations",
    "/v1/breaks",
    "/v1/maps/wave-height",
    "/v1/keys",
    "/v1/developers",
    "/v1/accounts",
    "/v1/usage/series",
    "/v1/account",
    "/v1/lists",
  ])("refuses %s without a caller, and lets no cache keep the refusal", async (path) => {
    const response = await send("GET", path);

    expect([response.status, response.headers.get("Cache-Control")]).toEqual([401, NOT_CACHED]);
  });

  it("refuses the other transport the same way", async () => {
    for (const path of ["/rpc/v1/stations/list", "/rpc/v1/breaks/list", "/rpc/privateData"]) {
      const response = await send("POST", path, { body: { json: {} } });

      expect([response.status, response.headers.get("Cache-Control")]).toEqual([401, NOT_CACHED]);
    }
    expect((await send("POST", "/rpc/healthCheck", { body: {} })).status).toBe(200);
  });

  it.each(["/v1", "/V1/stations", "//v1/stations", "/v1/stations/", "/v1%2Fstations", "/rpc"])(
    "gives no data at %s, which is not a route",
    async (path) => {
      expect((await send("GET", path)).status).not.toBe(200);
      expect((await send("POST", path, { body: { json: {} } })).status).not.toBe(200);
    },
  );

  it("answers an account by its session, and lets no cache keep the answer", async () => {
    const cookie = await signUp("visitor");

    const stations = await send("GET", "/v1/stations", { cookie });
    expect([stations.status, stations.headers.get("Cache-Control")]).toEqual([200, NOT_CACHED]);
    expect(await stations.json()).toEqual({ stations: [] });

    const account = await send("GET", "/v1/account", { cookie });
    expect(await account.json()).toMatchObject({ email: "visitor@example.org", isOperator: false });
    expect(
      (await send("POST", "/rpc/v1/stations/list", { cookie, origin: APP, body: { json: {} } }))
        .status,
    ).toBe(200);
  });

  it("answers a program by the key an operator made, on both transports", async () => {
    const cookie = await signUpOperator();
    const { key } = await makeKey(cookie);

    expect((await send("GET", "/v1/stations", { key })).status).toBe(200);
    expect((await send("POST", "/rpc/v1/stations/list", { key, body: { json: {} } })).status).toBe(
      200,
    );
    expect((await send("GET", "/v1/account", { key })).status).toBe(403);
    expect((await send("GET", "/v1/account", { key, cookie })).status).toBe(403);
    expect(
      (await send("GET", "/v1/stations", { key: `key_${"a".repeat(43)}`, cookie })).status,
    ).toBe(401);
  });

  it("refuses an account that is no operator what runs the instance", async () => {
    const operatorCookie = await signUpOperator();
    const developerId = await makeDeveloper(operatorCookie);
    const cookie = await signUp("visitor");
    const from = { cookie, origin: ADMIN };

    expect(
      (await send("POST", "/v1/keys", { ...from, body: { name: "mine", developerId } })).status,
    ).toBe(403);
    expect((await send("POST", "/v1/developers", { ...from, body: { name: "mine" } })).status).toBe(
      403,
    );
    for (const path of ["/v1/keys", "/v1/developers", "/v1/accounts"]) {
      expect((await send("GET", path, from)).status, path).toBe(403);
    }
    expect(await keys()).toEqual([]);
    expect(await database.db.select().from(developer)).toHaveLength(1);
  });

  describe("a write sent with a session's cookie", () => {
    const body = { name: "wanted by another site" };

    it.each<[string, By]>([
      ["a page of another site", { origin: ELSEWHERE }],
      ["a page that names itself only by its address", { referer: `${ELSEWHERE}/form` }],
      ["a page the browser will not name", { origin: "null" }],
      ["a sender that names no site", {}],
      ["another site, whatever address it claims", { origin: ELSEWHERE, referer: `${APP}/app` }],
    ])("is refused from %s", async (_, from) => {
      const cookie = await signUp("visitor");

      const response = await send("POST", "/v1/lists", { cookie, body, ...from });
      const overRpc = await send("POST", "/rpc/v1/lists/create", {
        cookie,
        body: { json: body },
        ...from,
      });

      expect([response.status, response.headers.get("Cache-Control")]).toEqual([403, NOT_CACHED]);
      expect(overRpc.status).toBe(403);
      expect(await lists()).toEqual([]);
    });

    it("is refused as a form too, which a page can send without asking", async () => {
      const cookie = await signUp("visitor");
      const headers = { Cookie: cookie, "Content-Type": "application/x-www-form-urlencoded" };

      const response = await app.request("/v1/lists", {
        method: "POST",
        headers,
        body: "name=evil",
      });

      expect(response.status).toBe(403);
      expect(await lists()).toEqual([]);
    });

    it.each<[string, By]>([
      ["the web app", { origin: APP }],
      ["the admin app", { origin: ADMIN }],
      ["the API's own reference", { origin: API }],
      ["a page of the web app that names itself by its address", { referer: `${APP}/app` }],
    ])("is taken from %s", async (_, from) => {
      const cookie = await signUp("visitor");

      expect((await send("POST", "/v1/lists", { cookie, body, ...from })).status).toBe(201);
      expect(await lists()).toHaveLength(1);
    });

    it("does not concern a read, nor a write that carries a key and no cookie", async () => {
      const cookie = await signUpOperator();
      const { key } = await makeKey(cookie);

      expect((await send("GET", "/v1/stations", { cookie, origin: ELSEWHERE })).status).toBe(200);
      const read = { key, origin: ELSEWHERE, body: { json: {} } };
      expect((await send("POST", "/rpc/v1/stations/list", read)).status).toBe(200);
    });
  });

  it("revokes a key for an operator, and the key stops at once", async () => {
    const cookie = await signUpOperator();
    const made = await makeKey(cookie);

    for (const origin of [ELSEWHERE, APP]) {
      expect((await send("DELETE", `/v1/keys/${made.id}`, { cookie, origin })).status).toBe(403);
    }
    expect((await send("GET", "/v1/stations", { key: made.key })).status).toBe(200);

    expect((await send("DELETE", `/v1/keys/${made.id}`, { cookie, origin: ADMIN })).status).toBe(
      200,
    );
    expect((await send("GET", "/v1/stations", { key: made.key })).status).toBe(401);
    const stored = (await keys()).find((row) => row.id === made.id);
    expect(stored?.revokedAt).toBeInstanceOf(Date);
  });

  it("says in the reference which way each route is called", async () => {
    const spec = await bodyOf<Spec>(await send("GET", "/v1/openapi.json"));

    expect(Object.keys(spec.components.securitySchemes).sort()).toEqual(["key", "session"]);
    expect(spec.security).toEqual([{ key: [] }, { session: [] }]);
    // A route of the shared data takes either, as the API as a whole says.
    expect(spec.paths["/stations"]?.get?.security).toBeUndefined();
    expect(spec.paths["/breaks/{id}"]?.get?.security).toBeUndefined();
    for (const [path, method] of [
      ["/account", "get"],
      ["/keys", "get"],
      ["/keys", "post"],
      ["/keys/{id}", "delete"],
      ["/developers", "get"],
      ["/developers", "post"],
      ["/developers/{id}", "patch"],
      ["/developers/{id}", "delete"],
      ["/developers/{id}/members", "get"],
      ["/developers/{id}/members", "post"],
      ["/developers/{id}/members/{accountId}", "delete"],
      ["/console", "get"],
      ["/console/usage/series", "get"],
      ["/console/usage/breakdown", "get"],
      ["/usage/series", "get"],
      ["/usage/breakdown", "get"],
      ["/accounts", "get"],
      ["/accounts/{id}", "get"],
      ["/accounts/{id}", "patch"],
      ["/accounts/{id}/sessions", "delete"],
      ["/accounts/{id}/username", "delete"],
      ["/actions", "get"],
      ["/instance", "get"],
      ["/lists", "get"],
      ["/spots", "post"],
      ["/notifications", "get"],
    ] as const) {
      expect(spec.paths[path]?.[method]?.security, `${method} ${path}`).toEqual([{ session: [] }]);
    }
    // What the link of a mail does asks for neither.
    expect(spec.paths["/alert-mails/off"]?.post?.security).toEqual([]);
    expect(spec.paths["/alert-mails/off"]?.get?.security).toEqual([]);
  });

  it("lets the web app's pages call, with their cookie and every method the API has", async () => {
    const headers = { Origin: APP, "Access-Control-Request-Method": "PUT" };
    const preflight = await app.request("/v1/lists/a/stations/b", { method: "OPTIONS", headers });

    expect(preflight.headers.get("Access-Control-Allow-Origin")).toBe(APP);
    expect(preflight.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    expect(preflight.headers.get("Access-Control-Allow-Methods")).toContain("PUT");
  });

  describe("what runs the instance", () => {
    const READS = ["/v1/developers", "/v1/keys", "/v1/accounts"];

    it("answers an operator from the admin's site, on both transports", async () => {
      const cookie = await signUpOperator();
      const from = { cookie, origin: ADMIN };
      const developerId = await makeDeveloper(cookie, { name: "Harbour screens" });

      for (const path of READS) expect((await send("GET", path, from)).status, path).toBe(200);
      const overRpc = await send("POST", "/rpc/v1/developers/list", { ...from, body: {} });
      expect(overRpc.status).toBe(200);
      expect(await bodyOf(overRpc)).toMatchObject({
        json: { developers: [{ id: developerId, name: "Harbour screens" }] },
      });
      // A page of the admin that names itself only by its address.
      expect(
        (await send("GET", "/v1/developers", { cookie, referer: `${ADMIN}/developers` })).status,
      ).toBe(200);
    });

    it.each<[string, By]>([
      ["the web app", { origin: APP }],
      ["a page of the web app that names itself by its address", { referer: `${APP}/app` }],
      ["the API's own pages, on an instance with an admin app", { origin: API }],
      ["the reference, by its address", { referer: `${API}/v1/docs` }],
      ["another site", { origin: ELSEWHERE }],
      ["a page the browser will not name", { origin: "null" }],
      ["a sender that names no site", {}],
      ["another site that claims the admin's address", { origin: APP, referer: `${ADMIN}/` }],
    ])("refuses an operator's read from %s", async (_, from) => {
      const cookie = await signUpOperator();
      await makeDeveloper(cookie);

      for (const path of READS) {
        const response = await send("GET", path, { cookie, ...from });
        expect([response.status, response.headers.get("Cache-Control")], path).toEqual([
          403,
          NOT_CACHED,
        ]);
        expect(JSON.stringify(await response.json())).not.toContain("a developer");
      }
      const overRpc = await send("POST", "/rpc/v1/developers/list", { cookie, body: {}, ...from });
      expect(overRpc.status).toBe(403);
    });

    it("makes and changes nothing for an operator's page of the web app", async () => {
      const cookie = await signUpOperator();
      const developerId = await makeDeveloper(cookie);
      const from = { cookie, origin: APP };
      const key = { name: "from the viewer", developerId };

      const attempts = await Promise.all([
        send("POST", "/v1/keys", { ...from, body: key }),
        send("POST", "/rpc/v1/keys/create", { ...from, body: { json: key } }),
        send("POST", "/v1/developers", { ...from, body: { name: "from the viewer" } }),
        send("PATCH", `/v1/developers/${developerId}`, { ...from, body: { suspended: true } }),
        send("DELETE", `/v1/developers/${developerId}`, from),
      ]);

      expect(attempts.map((response) => response.status)).toEqual([403, 403, 403, 403, 403]);
      expect(await keys()).toEqual([]);
      expect(await database.db.select().from(developer)).toMatchObject([
        { id: developerId, suspendedAt: null },
      ]);
    });

    it("takes no write as a read, whatever the transport", async () => {
      const cookie = await signUpOperator();
      const developerId = await makeDeveloper(cookie);
      const data = encodeURIComponent(JSON.stringify({ json: { name: "sly", developerId } }));

      // A page of another site can make a browser send these without naming itself.
      for (const method of ["GET", "HEAD"]) {
        for (const path of [`/rpc/v1/keys/create?data=${data}`, `/v1/keys?name=sly`]) {
          const response = await send(method, path, { cookie });
          expect(response.status, `${method} ${path}`).not.toBe(200);
          expect(response.status, `${method} ${path}`).not.toBe(201);
        }
      }
      const overridden = await app.request("/v1/keys", {
        method: "GET",
        headers: { Cookie: cookie, "X-HTTP-Method-Override": "POST" },
      });
      expect(overridden.status).toBe(403);
      expect(await keys()).toEqual([]);
    });

    it("answers an operator's script on an instance without an admin app, when it names the API", async () => {
      const cookie = await signUpOperator();
      const from = { cookie, origin: API };

      const made = await send("POST", "/v1/developers", { ...from, body: { name: "mine" } }, bare);
      expect(made.status).toBe(201);
      const { id: developerId } = await bodyOf<{ id: string }>(made);
      const key = await send(
        "POST",
        "/v1/keys",
        { ...from, body: { name: "k", developerId } },
        bare,
      );
      expect(key.status).toBe(201);
      expect((await send("GET", "/v1/keys", from, bare)).status).toBe(200);

      // The same script is refused when it names no site, the web app, or an admin app that
      // this instance does not have.
      for (const origin of [undefined, APP, ADMIN]) {
        expect((await send("GET", "/v1/keys", { cookie, origin }, bare)).status).toBe(403);
      }
    });

    it("lets the admin's pages call, with their cookie, and read when to call again", async () => {
      const headers = { Origin: ADMIN, "Access-Control-Request-Method": "PATCH" };
      const preflight = await app.request("/v1/developers/a", { method: "OPTIONS", headers });

      expect(preflight.headers.get("Access-Control-Allow-Origin")).toBe(ADMIN);
      expect(preflight.headers.get("Access-Control-Allow-Credentials")).toBe("true");
      expect(preflight.headers.get("Access-Control-Allow-Methods")).toContain("PATCH");

      const read = await send("GET", "/v1/developers", { origin: ADMIN });
      expect(read.headers.get("Access-Control-Allow-Origin")).toBe(ADMIN);
      expect(read.headers.get("Access-Control-Expose-Headers")).toContain("Retry-After");

      // The web app's pages still may, and no other site does. Without an admin app, its
      // address is one more site the API does not know.
      const fromWeb = await send("GET", "/v1/stations", { origin: APP });
      expect(fromWeb.headers.get("Access-Control-Allow-Origin")).toBe(APP);
      for (const [origin, to] of [
        [ELSEWHERE, app],
        [ADMIN, bare],
      ] as const) {
        const refused = await send("GET", "/v1/stations", { origin }, to);
        expect(refused.headers.get("Access-Control-Allow-Origin")).toBeNull();
      }
    });

    // The sign-in library does not ask where a request comes from while it runs under a test,
    // so that an address it does not know is refused is checked on a running API instead.
    it("signs an account in from the admin's site, with a session the API then knows", async () => {
      await signUp("owner");
      const body = { email: "owner@example.org", password: "made-up-for-these-tests" };

      const signedIn = await send("POST", "/api/auth/sign-in/email", { origin: ADMIN, body });
      expect(signedIn.status).toBe(200);
      expect(signedIn.headers.get("Access-Control-Allow-Origin")).toBe(ADMIN);
      const cookie = signedIn.headers
        .getSetCookie()
        .map((set) => set.split(";")[0])
        .join("; ");
      const account = await send("GET", "/v1/account", { cookie, origin: ADMIN });
      expect(await account.json()).toMatchObject({ email: "owner@example.org" });
    });

    it.each([
      ["the web app's", { ADMIN_ORIGIN: `${APP}/` }],
      // An instance without a web app, whose three addresses would be one.
      ["the web app's and the API's at once", { CORS_ORIGIN: API, ADMIN_ORIGIN: API }],
    ])("does not start when the admin's address is %s", (_, addresses) => {
      const same = { ...env, ...addresses };

      expect(() => make(same)).toThrow("ADMIN_ORIGIN must not be the web app's address");
    });

    it("starts without a web app, with the admin at an address of its own or with none", () => {
      for (const addresses of [{ CORS_ORIGIN: API }, { CORS_ORIGIN: API, ADMIN_ORIGIN: ADMIN }]) {
        const alone = { ...env, ...addresses };

        expect(() => make(alone)).not.toThrow();
      }
    });
  });

  describe("an account that an operator suspends", () => {
    const password = "made-up-for-these-tests";
    const signIn = (name: string) =>
      send("POST", "/api/auth/sign-in/email", {
        origin: APP,
        body: { email: `${name}@example.org`, password },
      });
    const cookieOf = (response: Response) =>
      response.headers
        .getSetCookie()
        .map((set) => set.split(";")[0])
        .join("; ");
    const idOf = async (cookie: string) =>
      (await bodyOf<{ id: string }>(await send("GET", "/v1/account", { cookie }))).id;
    const sessionsOf = async (id: string) =>
      (await database.db.select().from(session)).filter((row) => row.userId === id);

    it("is signed out everywhere, cannot sign in, and can again once it is let in", async () => {
      const operatorCookie = await signUpOperator();
      const from = { cookie: operatorCookie, origin: ADMIN };
      const cookie = await signUp("guest");
      const second = cookieOf(await signIn("guest"));
      const id = await idOf(cookie);
      expect(await sessionsOf(id)).toHaveLength(2);

      const seen = await send("GET", `/v1/accounts/${id}`, from);
      expect(await bodyOf(seen)).toMatchObject({ id, sessions: 2, suspendedAt: null });

      const suspended = await send("PATCH", `/v1/accounts/${id}`, {
        ...from,
        body: { suspended: true },
      });
      expect(suspended.status).toBe(200);
      expect(await bodyOf(suspended)).toMatchObject({ id, sessions: 0 });

      // Both of its devices are signed out, at the next thing they ask.
      for (const old of [cookie, second]) {
        expect((await send("GET", "/v1/account", { cookie: old })).status).toBe(401);
      }
      const refused = await signIn("guest");
      expect(refused.status).toBe(403);
      expect(await bodyOf(refused)).toEqual({
        code: "ACCOUNT_SUSPENDED",
        message: "This account is suspended.",
      });
      expect(await sessionsOf(id)).toEqual([]);
      // Whatever the refusal carries opens nothing.
      const left = cookieOf(refused);
      if (left) expect((await send("GET", "/v1/account", { cookie: left })).status).toBe(401);

      const letIn = await send("PATCH", `/v1/accounts/${id}`, {
        ...from,
        body: { suspended: false },
      });
      expect(await bodyOf(letIn)).toMatchObject({ suspendedAt: null, sessions: 0 });
      expect((await send("GET", "/v1/account", { cookie })).status).toBe(401);
      const back = await signIn("guest");
      expect(back.status).toBe(200);
      expect((await send("GET", "/v1/account", { cookie: cookieOf(back) })).status).toBe(200);
    });

    it("has its sessions closed over both transports, an operator's own too", async () => {
      const operatorCookie = await signUpOperator();
      const from = { cookie: operatorCookie, origin: ADMIN };
      const cookie = await signUp("guest");
      const id = await idOf(cookie);

      const closed = await send("POST", "/rpc/v1/accounts/signOut", {
        ...from,
        body: { json: { id } },
      });
      expect(await bodyOf(closed)).toMatchObject({ json: { closed: 1 } });
      expect((await send("GET", "/v1/account", { cookie })).status).toBe(401);

      const own = await send("DELETE", `/v1/accounts/${await idOf(operatorCookie)}/sessions`, from);
      expect(await bodyOf(own)).toEqual({ closed: 1 });
      // The operator is signed out by what they did.
      expect((await send("GET", "/v1/accounts", from)).status).toBe(401);
    });

    it("refuses to suspend an operator, and anything asked from elsewhere than the admin", async () => {
      const operatorCookie = await signUpOperator();
      const operatorId = await idOf(operatorCookie);
      const guest = await idOf(await signUp("guest"));

      const own = await send("PATCH", `/v1/accounts/${operatorId}`, {
        cookie: operatorCookie,
        origin: ADMIN,
        body: { suspended: true },
      });
      expect(own.status).toBe(409);

      for (const by of [{ origin: APP }, {}] satisfies By[]) {
        const refused = await send("PATCH", `/v1/accounts/${guest}`, {
          cookie: operatorCookie,
          ...by,
          body: { suspended: true },
        });
        expect(refused.status).toBe(403);
      }
      expect(await database.db.select().from(accountSuspension)).toEqual([]);
    });

    // Waits until a statement of this database waits for a lock: what was started is then
    // known to have reached it, however slow the machine.
    async function untilBlocked() {
      for (let tries = 0; tries < 300; tries += 1) {
        const { rows } = await database.db.$client.query(
          "select count(*)::int as waiting from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'",
        );
        if (rows[0]?.waiting > 0) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error("Nothing waits for a lock");
    }

    it("refuses a sign-in that was under way when the suspension was written, and leaves it no session", async () => {
      const cookie = await signUp("guest");
      const id = await idOf(cookie);
      await database.db.delete(session);

      // An operator suspends the account: the transaction holds its row, and is not written
      // yet. Nobody else sees the suspension.
      const suspending = await database.db.$client.connect();
      try {
        await suspending.query("begin");
        await suspending.query('select id from "user" where id = $1 for no key update', [id]);
        await suspending.query("insert into account_suspension (user_id) values ($1)", [id]);

        // The account signs in, through the sign-in itself: it sees no suspension, writes its
        // session, and then waits for the account's row.
        const signingIn = signIn("guest");
        await untilBlocked();
        expect(await sessionsOf(id)).toHaveLength(1);

        await suspending.query("delete from session where user_id = $1", [id]);
        await suspending.query("commit");

        const refused = await signingIn;
        expect(refused.status).toBe(403);
        expect(await bodyOf(refused)).toEqual({
          code: "ACCOUNT_SUSPENDED",
          message: "This account is suspended.",
        });
        // The session it had written is gone, and what the refusal carries opens nothing.
        expect(await sessionsOf(id)).toEqual([]);
        const left = cookieOf(refused);
        if (left) expect((await send("GET", "/v1/account", { cookie: left })).status).toBe(401);
      } finally {
        await suspending.query("rollback").catch(() => {});
        suspending.release();
      }
    });

    it("answers an operator over the other transport too, and nobody else", async () => {
      const operatorCookie = await signUpOperator();
      const from = { cookie: operatorCookie, origin: ADMIN };
      const guestCookie = await signUp("guest");
      const id = await idOf(guestCookie);
      const rpc = (procedure: string, by: By, json: object) =>
        send("POST", `/rpc/v1/accounts/${procedure}`, { ...by, body: { json } });

      expect(await bodyOf(await rpc("get", from, { id }))).toMatchObject({
        json: { id, sessions: 1, suspendedAt: null },
      });
      // The account itself, an operator from the web app's site, and a caller with no session.
      for (const by of [
        { cookie: guestCookie, origin: ADMIN },
        { cookie: operatorCookie, origin: APP },
        { origin: ADMIN },
      ] satisfies By[]) {
        expect((await rpc("get", by, { id })).status).toBeGreaterThanOrEqual(401);
        expect((await rpc("update", by, { id, suspended: true })).status).toBeGreaterThanOrEqual(
          401,
        );
      }
      expect(await database.db.select().from(accountSuspension)).toEqual([]);

      const suspended = await rpc("update", from, { id, suspended: true });
      expect(await bodyOf<{ json: { suspendedAt: unknown } }>(suspended)).toMatchObject({
        json: { id, sessions: 0 },
      });
      expect(await database.db.select().from(accountSuspension)).toHaveLength(1);
    });

    it("leaves a session that an account opens while nothing suspends it", async () => {
      const cookie = await signUp("guest");
      const id = await idOf(cookie);
      const [opened] = await sessionsOf(id);

      await expect(
        suspensionHooks(database.db).after({ id: opened!.id, userId: id }, null),
      ).resolves.toBeUndefined();
      expect(await sessionsOf(id)).toHaveLength(1);
    });
  });

  describe("an account's address, checked by mail", () => {
    const password = "made-up-for-these-tests";
    const cookieOf = (response: Response) =>
      response.headers
        .getSetCookie()
        .map((set) => set.split(";")[0])
        .join("; ");
    const signUpTo = async (to: ReturnType<typeof createApp>, name: string, language?: string) => {
      const body = { name, email: `${name}@example.org`, password };
      const response = await send(
        "POST",
        "/api/auth/sign-up/email",
        { origin: APP, body, language },
        to,
      );
      return { status: response.status, cookie: cookieOf(response) };
    };
    const accountOf = async (to: ReturnType<typeof createApp>, cookie: string) =>
      bodyOf<{ emailVerified: boolean; checksAddresses: boolean }>(
        await send("GET", "/v1/account", { cookie }, to),
      );
    // The link of a mail, as the address the API is asked at.
    const pathOf = (link: string | null) => {
      const url = new URL(link ?? "");
      return `${url.pathname}${url.search}`;
    };
    beforeEach(async () => {
      await database.db.delete(providerCalls);
    });

    it("sends a mail at sign-up, in the language asked for, and signs the account in all the same", async () => {
      const mailing = make({ ...env, ADMIN_ORIGIN: ADMIN }, { on: true });

      const signedUp = await signUpTo(mailing.app, "ana", "fr-FR,fr;q=0.9");

      expect(signedUp.status).toBe(200);
      expect(mailing.sent()).toHaveLength(1);
      expect(mailing.sent()[0]).toMatchObject({ to: "ana@example.org" });
      expect(mailing.sent()[0]?.subject).toContain("Vérifie ton adresse");
      expect(await accountOf(mailing.app, signedUp.cookie)).toMatchObject({
        emailVerified: false,
        checksAddresses: true,
      });
      // An account that signs in again is sent nothing.
      const body = { email: "ana@example.org", password };
      await send("POST", "/api/auth/sign-in/email", { origin: APP, body }, mailing.app);
      expect(mailing.sent()).toHaveLength(1);
      // The link ends on the page in the language of its mail.
      const followed = await send("GET", pathOf(mailing.link()), {}, mailing.app);
      expect(followed.headers.get("Location")).toBe(`${APP}/fr/verified`);
    });

    it("marks the address as checked when the link is followed, signs no one in, and ends on the web app", async () => {
      const mailing = make({ ...env, ADMIN_ORIGIN: ADMIN }, { on: true });
      const { cookie } = await signUpTo(mailing.app, "ana");

      // Followed in another browser, which holds no session.
      const followed = await send("GET", pathOf(mailing.link()), {}, mailing.app);

      expect(followed.status).toBe(302);
      expect(followed.headers.get("Location")).toBe(`${APP}/verified`);
      expect(cookieOf(followed)).not.toContain("session_token");
      expect(await accountOf(mailing.app, cookie)).toMatchObject({ emailVerified: true });

      // Followed a second time, it changes nothing and ends on the same page.
      const again = await send("GET", pathOf(mailing.link()), {}, mailing.app);
      expect(again.headers.get("Location")).toBe(`${APP}/verified`);
      // And the account is refused another mail.
      const more = await send(
        "POST",
        "/v1/account/verification",
        { cookie, origin: APP, body: {} },
        mailing.app,
      );
      expect(more.status).toBe(409);
    });

    it("ends on the web app with what went wrong, for a link that was changed or is too old", async () => {
      const mailing = make({ ...env, ADMIN_ORIGIN: ADMIN }, { on: true });
      const { cookie } = await signUpTo(mailing.app, "ana");
      const link = new URL(mailing.link() ?? "");

      const changed = new URL(link);
      changed.searchParams.set("token", `${link.searchParams.get("token")}x`);
      const tampered = await send("GET", pathOf(changed.href), {}, mailing.app);
      expect(tampered.headers.get("Location")).toBe(`${APP}/verified?error=INVALID_TOKEN`);

      const old = new URL(link);
      old.searchParams.set(
        "token",
        await createEmailVerificationToken(
          env.BETTER_AUTH_SECRET,
          "ana@example.org",
          undefined,
          -60,
        ),
      );
      const expired = await send("GET", pathOf(old.href), {}, mailing.app);
      expect(expired.headers.get("Location")).toBe(`${APP}/verified?error=TOKEN_EXPIRED`);

      // A link that would end on another site is refused by the sign-in library, which does not
      // ask where a link leads while it runs under a test: that is checked on a running API.
      expect(await accountOf(mailing.app, cookie)).toMatchObject({ emailVerified: false });
    });

    it("sends the mail again to the account that asks, three times an hour, and says how long to wait", async () => {
      // The mails of this test are counted in one hour: it does not start as an hour ends.
      const { rows } = await database.db.$client.query(
        "select extract(epoch from date_trunc('hour', now(), 'UTC') + interval '1 hour' - now())::float8 as left",
      );
      if (rows[0]?.left < 5) await new Promise((resolve) => setTimeout(resolve, 5500));
      const mailing = make({ ...env, ADMIN_ORIGIN: ADMIN }, { on: true });
      const { cookie } = await signUpTo(mailing.app, "ana");
      const again = (by: By = {}) =>
        send(
          "POST",
          "/v1/account/verification",
          { cookie, origin: APP, body: { locale: "fr" }, ...by },
          mailing.app,
        );

      // The mail of the sign-up was the first of the hour.
      for (const expected of [200, 200, 429]) expect((await again()).status).toBe(expected);
      expect(mailing.sent()).toHaveLength(3);
      expect(mailing.sent()[2]?.subject).toContain("Vérifie");

      const refused = await again();
      const wait = Number(refused.headers.get("Retry-After"));
      expect(wait).toBeGreaterThan(0);
      expect(wait).toBeLessThanOrEqual(3600);
      // Over the other transport too, and for no one without a session or with a key.
      const overRpc = await send(
        "POST",
        "/rpc/v1/account/sendVerification",
        { cookie, origin: APP, body: { json: {} } },
        mailing.app,
      );
      expect(overRpc.status).toBe(429);
      expect((await again({ cookie: undefined })).status).toBe(401);
    });

    it("has no route that mails an address given without a session", async () => {
      const mailing = make({ ...env, ADMIN_ORIGIN: ADMIN }, { on: true });
      await signUpTo(mailing.app, "ana");

      const asked = await send(
        "POST",
        "/api/auth/send-verification-email",
        { origin: APP, body: { email: "ana@example.org" } },
        mailing.app,
      );

      expect(asked.status).toBe(404);
      expect(mailing.sent()).toHaveLength(1);
    });

    it("makes the account whether its mail left or not", async () => {
      const failing = make({ ...env, ADMIN_ORIGIN: ADMIN }, { on: true, failing: true });
      const small = make({ ...env, ADMIN_ORIGIN: ADMIN }, { on: true, dailyLimit: 1 });

      const unsent = await signUpTo(failing.app, "ana");
      expect(unsent.status).toBe(200);
      expect(await accountOf(failing.app, unsent.cookie)).toMatchObject({ emailVerified: false });

      await database.db.delete(providerCalls);
      expect((await signUpTo(small.app, "ben")).status).toBe(200);
      // The instance has sent its mail for the day: the next account is made without one.
      const late = await signUpTo(small.app, "cleo");
      expect(late.status).toBe(200);
      expect(small.sent().map((mail) => mail.to)).toEqual(["ben@example.org"]);
      const asked = await send(
        "POST",
        "/v1/account/verification",
        { cookie: late.cookie, origin: APP, body: {} },
        small.app,
      );
      expect(asked.status).toBe(503);
      expect(asked.headers.get("Retry-After")).toBeNull();
    });

    it("checks no address on an instance that sends no mail", async () => {
      const signedUp = await signUpTo(app, "ana");

      expect(signedUp.status).toBe(200);
      expect(await accountOf(app, signedUp.cookie)).toEqual(
        expect.objectContaining({ emailVerified: false, checksAddresses: false }),
      );
      const asked = await send("POST", "/v1/account/verification", {
        cookie: signedUp.cookie,
        origin: APP,
        body: {},
      });
      expect(asked.status).toBe(503);
    });

    describe("and a new password, chosen by a link it is sent", () => {
      const NEUTRAL = {
        status: true,
        message: "If this email exists in our system, check your email for the reset link",
      };
      const ask = (to: ReturnType<typeof createApp>, email: string, language?: string) =>
        send(
          "POST",
          "/api/auth/request-password-reset",
          { origin: APP, body: { email }, language },
          to,
        );
      const choose = (to: ReturnType<typeof createApp>, token: string, newPassword: string) =>
        send("POST", "/api/auth/reset-password", { origin: APP, body: { token, newPassword } }, to);
      const signIn = (to: ReturnType<typeof createApp>, password: string) =>
        send(
          "POST",
          "/api/auth/sign-in/email",
          { origin: APP, body: { email: "ana@example.org", password } },
          to,
        );
      // The mails for a new password, apart from the one that checks the address at sign-up.
      const resets = (mailing: ReturnType<typeof make>) =>
        mailing.sent().filter((mail) => !mail.subject.includes("Check your address"));
      // The mail leaves after the answer: the test waits for it.
      const sentOne = async (mailing: ReturnType<typeof make>, count = 1) => {
        await vi.waitFor(() => expect(resets(mailing)).toHaveLength(count));
        return new URL(mailing.link() ?? "");
      };

      it("answers the same whether the address has an account, and mails only the one that has", async () => {
        const mailing = make({ ...env, ADMIN_ORIGIN: ADMIN }, { on: true });
        await signUpTo(mailing.app, "ana");

        const known = await ask(mailing.app, "ana@example.org", "es-ES,es;q=0.9");
        const unknown = await ask(mailing.app, "nobody@example.org", "es-ES,es;q=0.9");

        expect([known.status, await known.json()]).toEqual([200, NEUTRAL]);
        expect([unknown.status, await unknown.json()]).toEqual([200, NEUTRAL]);
        const link = await sentOne(mailing);
        expect(resets(mailing)[0]).toMatchObject({ to: "ana@example.org" });
        expect(resets(mailing)[0]?.subject).toContain("Elige una nueva contraseña");
        // The link opens the page of the web app in the language of its mail, with its token.
        expect(`${link.origin}${link.pathname}`).toBe(`${APP}/es/reset-password`);
        expect(link.searchParams.get("token")).toMatch(/^\w{24}$/);
      });

      it("writes the mail in the language the account's alerts are sent in, once it is known", async () => {
        const mailing = make({ ...env, ADMIN_ORIGIN: ADMIN }, { on: true });
        const { cookie } = await signUpTo(mailing.app, "ana");
        const { id } = await bodyOf<{ id: string }>(
          await send("GET", "/v1/account", { cookie }, mailing.app),
        );
        await database.db.insert(alertSettings).values({ userId: id, locale: "pt" });

        await ask(mailing.app, "ana@example.org", "fr-FR");

        const link = await sentOne(mailing);
        expect(resets(mailing)[0]?.subject).toContain("Escolhe uma nova palavra-passe");
        expect(link.pathname).toBe("/pt/reset-password");
      });

      it("sets the new password once, closes every session of the account, and works no more", async () => {
        const mailing = make({ ...env, ADMIN_ORIGIN: ADMIN }, { on: true });
        const { cookie } = await signUpTo(mailing.app, "ana");
        await ask(mailing.app, "ana@example.org");
        const token = (await sentOne(mailing)).searchParams.get("token") ?? "";

        const chosen = await choose(mailing.app, token, "a-new-made-up-password");

        expect(chosen.status).toBe(200);
        expect((await send("GET", "/v1/account", { cookie }, mailing.app)).status).toBe(401);
        expect((await signIn(mailing.app, password)).status).toBe(401);
        expect((await signIn(mailing.app, "a-new-made-up-password")).status).toBe(200);
        // The link was spent: the password stays the one it chose.
        const again = await choose(mailing.app, token, "yet-another-made-up-password");
        expect(again.status).toBe(400);
        expect(await again.json()).toMatchObject({ code: "INVALID_TOKEN" });
        expect((await signIn(mailing.app, "a-new-made-up-password")).status).toBe(200);
      });

      it("refuses a link that is too old", async () => {
        const mailing = make({ ...env, ADMIN_ORIGIN: ADMIN }, { on: true });
        await signUpTo(mailing.app, "ana");
        await ask(mailing.app, "ana@example.org");
        const token = (await sentOne(mailing)).searchParams.get("token") ?? "";
        await database.db.$client.query(
          "update verification set expires_at = now() - interval '1 second' where identifier = $1",
          [`reset-password:${token}`],
        );

        const chosen = await choose(mailing.app, token, "a-new-made-up-password");

        expect(chosen.status).toBe(400);
        expect((await signIn(mailing.app, password)).status).toBe(200);
      });

      it("mails an account three times an hour, and answers the same after", async () => {
        // The mails of this test are counted in one hour: it does not start as an hour ends.
        const { rows } = await database.db.$client.query(
          "select extract(epoch from date_trunc('hour', now(), 'UTC') + interval '1 hour' - now())::float8 as left",
        );
        if (rows[0]?.left < 5) await new Promise((resolve) => setTimeout(resolve, 5500));
        const mailing = make({ ...env, ADMIN_ORIGIN: ADMIN }, { on: true });
        await signUpTo(mailing.app, "ana");
        vi.mocked(console.error).mockClear();

        for (let count = 1; count <= 3; count += 1) {
          await ask(mailing.app, "ana@example.org");
          await sentOne(mailing, count);
        }
        const fourth = await ask(mailing.app, "ana@example.org");

        expect([fourth.status, await fourth.json()]).toEqual([200, NEUTRAL]);
        await vi.waitFor(() =>
          expect(console.error).toHaveBeenCalledWith("mail: no mail for a new password (account)"),
        );
        expect(resets(mailing)).toHaveLength(3);
        // The account's checks of its address are counted apart, and are not spent by these.
        expect(mailing.sent()).toHaveLength(4);
      });

      it("is refused by an instance that sends no mail", async () => {
        await signUpTo(app, "ana");

        const asked = await ask(app, "ana@example.org");

        expect(asked.status).toBe(400);
        expect(await asked.json()).toMatchObject({ code: "RESET_PASSWORD_DISABLED" });
      });
    });
  });

  describe("the console of a developer account", () => {
    const SPAN = "from=2026-01-01T00:00:00Z&to=2026-01-02T00:00:00Z";
    const span = { from: "2026-01-01T00:00:00Z", to: "2026-01-02T00:00:00Z" };

    /** Two developer accounts with a key each, and an account that is a member of the first. */
    async function shared() {
      const owner = await signUpOperator();
      const screens = await makeDeveloper(owner, { name: "Harbour screens", contact: "quay" });
      const clock = await makeDeveloper(owner, { name: "Tide clock" });
      const { key } = await makeKey(owner, screens);
      await makeKey(owner, clock);
      const member = await signUp("ana");
      const { id } = await bodyOf<{ id: string }>(
        await send("GET", "/v1/account", { cookie: member }),
      );
      const added = await send("POST", `/v1/developers/${screens}/members`, {
        cookie: owner,
        origin: ADMIN,
        body: { accountId: id },
      });
      expect(added.status).toBe(200);
      return { owner, member, memberId: id, screens, clock, key };
    }

    it("answers a member with its developer account alone, on both transports", async () => {
      const { member, screens, clock, key } = await shared();

      // From the admin's site, where the console is, and from the web app's as any account's.
      for (const origin of [ADMIN, APP]) {
        const answer = await send("GET", "/v1/console", { cookie: member, origin });
        expect([answer.status, answer.headers.get("Cache-Control")]).toEqual([200, NOT_CACHED]);
        const text = JSON.stringify(await answer.json());
        expect(text).toContain("Harbour screens");
        for (const kept of ["Tide clock", clock, "quay", key.slice(8)]) {
          expect(text).not.toContain(kept);
        }
      }
      const overRpc = await send("POST", "/rpc/v1/console/get", {
        cookie: member,
        origin: ADMIN,
        body: {},
      });
      expect(await bodyOf(overRpc)).toMatchObject({
        json: { developers: [{ id: screens, name: "Harbour screens", keys: [{}] }] },
      });

      const calls = await send("GET", `/v1/console/usage/series?developerId=${screens}&${SPAN}`, {
        cookie: member,
        origin: ADMIN,
      });
      expect([calls.status, await calls.json()]).toEqual([200, { points: [] }]);
    });

    it("answers 404 for a developer account the caller is no member of, as for none", async () => {
      const { member, clock } = await shared();
      const from = { cookie: member, origin: ADMIN };

      for (const developerId of [clock, crypto.randomUUID()]) {
        for (const path of [
          `/v1/console/usage/series?developerId=${developerId}&${SPAN}`,
          `/v1/console/usage/breakdown?developerId=${developerId}&${SPAN}&by=key`,
          `/v1/console/usage/breakdown?developerId=${developerId}&${SPAN}&by=procedure`,
        ]) {
          const answer = await send("GET", path, from);
          expect([answer.status, await answer.json()], path).toEqual([
            404,
            expect.objectContaining({ message: "No such developer account." }),
          ]);
        }
        const overRpc = await send("POST", "/rpc/v1/console/breakdown", {
          ...from,
          body: { json: { ...span, developerId, by: "key" } },
        });
        expect(overRpc.status).toBe(404);
      }
      // What the operator's counts take is refused to a member, whatever it names.
      expect(
        (await send("GET", `/v1/usage/series?developerId=${clock}&${SPAN}`, from)).status,
      ).toBe(403);
    });

    it("answers no key, no one, and no page of another site", async () => {
      const { member, key } = await shared();

      expect((await send("GET", "/v1/console", { key })).status).toBe(403);
      expect((await send("GET", "/v1/console", { key, cookie: member })).status).toBe(403);
      expect((await send("GET", "/v1/console")).status).toBe(401);
      // A page of another site may send the cookie: it is given no leave to read the answer,
      // and the other transport refuses it outright.
      const elsewhere = await send("GET", "/v1/console", { cookie: member, origin: ELSEWHERE });
      expect(elsewhere.headers.get("Access-Control-Allow-Origin")).toBeNull();
      const overRpc = await send("POST", "/rpc/v1/console/get", {
        cookie: member,
        origin: ELSEWHERE,
        body: {},
      });
      expect(overRpc.status).toBe(403);
    });

    it("has its members named by an operator from the admin's site, and by nobody else", async () => {
      const { owner, member, memberId, screens, clock } = await shared();
      const members = `/v1/developers/${clock}/members`;
      const body = { accountId: memberId };

      // A member adds itself to nothing, and an operator's page of the web app adds no one.
      for (const by of [
        { cookie: member, origin: ADMIN },
        { cookie: owner, origin: APP },
        { cookie: owner, origin: ELSEWHERE },
      ]) {
        expect((await send("POST", members, { ...by, body })).status).toBe(403);
        expect((await send("GET", members, by)).status).toBe(403);
        expect(
          (await send("DELETE", `/v1/developers/${screens}/members/${memberId}`, by)).status,
        ).toBe(403);
      }
      const overRpc = await send("POST", "/rpc/v1/developers/addMember", {
        cookie: member,
        origin: ADMIN,
        body: { json: { id: clock, accountId: memberId } },
      });
      expect(overRpc.status).toBe(403);

      // Taken out by the operator, the member reads nothing from its next call.
      const removed = await send("DELETE", `/v1/developers/${screens}/members/${memberId}`, {
        cookie: owner,
        origin: ADMIN,
      });
      expect([removed.status, await removed.json()]).toEqual([200, { members: [] }]);
      const after = await send("GET", "/v1/console", { cookie: member, origin: ADMIN });
      expect(await after.json()).toEqual({ developers: [] });
      expect(
        (
          await send("GET", `/v1/console/usage/series?developerId=${screens}&${SPAN}`, {
            cookie: member,
            origin: ADMIN,
          })
        ).status,
      ).toBe(404);
    });
  });

  describe("the search of places", () => {
    const FOUND = {
      features: [
        {
          geometry: { coordinates: [-4.35, 47.83] },
          properties: { name: "Plage des Galets", city: "Kerlouarn", country: "France" },
        },
      ],
    };
    const searching = (answer: unknown) => {
      const service = testPlaces(answer);
      return {
        ...service,
        to: make({ ...env, ADMIN_ORIGIN: ADMIN }, undefined, service.places).app,
      };
    };

    it("finds an account a place by its name, and answers no key and no one", async () => {
      const { to, asked } = searching(FOUND);
      const cookie = await signUpOperator();
      const { key } = await makeKey(cookie);
      const path =
        "/v1/places?q=plage%20des%20galets&latitude=47.84&longitude=-4.35&zoom=9.2&locale=fr";

      const found = await send("GET", path, { cookie }, to);
      expect([found.status, found.headers.get("Cache-Control")]).toEqual([200, NOT_CACHED]);
      expect(await found.json()).toEqual({
        places: [
          {
            name: "Plage des Galets",
            location: ["France", "Kerlouarn"],
            latitude: 47.83,
            longitude: -4.35,
          },
        ],
        source: {
          name: "OpenStreetMap",
          url: "https://www.openstreetmap.org/copyright",
          attribution: "(c) OpenStreetMap contributors",
          license: {
            type: "ODbL-1.0",
            url: "https://opendatacommons.org/licenses/odbl/1-0/",
            commercialUse: true,
          },
        },
      });
      expect(asked).toEqual([
        "https://places.example.org/api?q=plage+des+galets&limit=10&layer=city&layer=district" +
          "&layer=locality&layer=county&layer=state&layer=country&layer=other" +
          "&lang=fr&lat=47.8&lon=-4.3&zoom=9",
      ]);

      expect((await send("GET", path, { key }, to)).status).toBe(403);
      expect((await send("GET", path, {}, to)).status).toBe(401);
      // A name too short to search, half of a point, and a point that is no number.
      expect((await send("GET", "/v1/places?q=a", { cookie }, to)).status).toBe(400);
      expect((await send("GET", "/v1/places?q=plage&latitude=47", { cookie }, to)).status).toBe(
        400,
      );
      expect(
        (await send("GET", "/v1/places?q=plage&latitude=&longitude=", { cookie }, to)).status,
      ).toBe(400);
      const overRpc = (json: object) =>
        send("POST", "/rpc/v1/places/search", { cookie, origin: APP, body: { json } }, to);
      // Each of them alone, beside a number that is one: a refusal is then that value's own.
      for (const wrong of [
        { latitude: null, longitude: 0 },
        { latitude: 0, longitude: null },
        { latitude: true, longitude: 0 },
        { latitude: 0, longitude: [] },
        { latitude: "", longitude: 0 },
        { latitude: 91, longitude: 0 },
        { latitude: 0, longitude: 0, zoom: false },
        { limit: true },
        { limit: "many" },
        { limit: 2.5 },
      ]) {
        expect((await overRpc({ q: "plage", ...wrong })).status).toBe(400);
      }
      expect(asked).toHaveLength(1);
      // The same search over the other transport, with numbers as JSON writes them.
      const again = await overRpc({
        q: "plage des galets",
        latitude: 47.84,
        longitude: -4.35,
        zoom: 9.2,
        locale: "fr",
      });
      expect(again.status).toBe(200);
      expect(asked).toHaveLength(1);
    });

    it("says when to search again while the service is left alone, and logs no search", async () => {
      const { to, asked } = searching(429);
      const cookie = await signUp("visitor");

      // The search that met the refusal is told how long the service rests, and so is the next.
      const failed = await send("GET", "/v1/places?q=phare", { cookie }, to);
      expect([failed.status, failed.headers.get("Retry-After")]).toEqual([503, "30"]);
      const resting = await send("GET", "/v1/places?q=plage", { cookie }, to);
      const wait = Number(resting.headers.get("Retry-After"));

      expect(resting.status).toBe(503);
      expect(wait).toBeGreaterThan(0);
      expect(wait).toBeLessThanOrEqual(30);
      expect(asked).toHaveLength(1);
      const said = [...vi.mocked(console.error).mock.calls, ...logged.mock.calls].flat().join(" ");
      expect(said).toContain("places: the search service answered 429");
      expect(said).not.toContain("phare");
    });

    it("says that a search may be made again at once after one the service called wrong", async () => {
      const { to, asked } = searching(400);
      const cookie = await signUp("visitor");

      const wrong = await send("GET", "/v1/places?q=phare", { cookie }, to);
      expect([wrong.status, wrong.headers.get("Retry-After")]).toEqual([503, "0"]);
      const again = await send(
        "POST",
        "/rpc/v1/places/search",
        { cookie, origin: APP, body: { json: { q: "plage" } } },
        to,
      );
      expect([again.status, again.headers.get("Retry-After")]).toEqual([503, "0"]);
      // Nothing rested: both reached the service.
      expect(asked).toHaveLength(2);
    });
  });

  describe("a developer account's limit", () => {
    it("answers 429 over it, and says how long is left in the hour", async () => {
      const cookie = await signUpOperator();
      const developerId = await makeDeveloper(cookie, { name: "limited", callsPerHour: 2 });
      const { key } = await makeKey(cookie, developerId);

      const statuses = [];
      for (let index = 0; index < 3; index += 1) {
        statuses.push((await send("GET", "/v1/stations", { key })).status);
      }
      expect(statuses).toEqual([200, 200, 429]);

      const refused = await send("POST", "/rpc/v1/stations/list", { key, body: { json: {} } });
      expect([refused.status, refused.headers.get("Cache-Control")]).toEqual([429, NOT_CACHED]);
      const left = Number(refused.headers.get("Retry-After"));
      expect(left).toBeGreaterThan(0);
      expect(left).toBeLessThanOrEqual(3600);
      expect(await refused.json()).toMatchObject({ json: { code: "TOO_MANY_REQUESTS" } });
    });
  });

  describe("a visitor of the web app", () => {
    it("reads what everyone shares with no account, from the web app and from nowhere else", async () => {
      const read = await send("GET", "/v1/stations", { origin: APP });
      expect([read.status, read.headers.get("Cache-Control")]).toEqual([200, NOT_CACHED]);
      const called = await send("POST", "/rpc/v1/stations/list", {
        origin: APP,
        body: { json: {} },
      });
      expect(called.status).toBe(200);
      // A page of the web app that names itself by its address.
      expect((await send("GET", "/v1/stations", { referer: `${APP}/app` })).status).toBe(200);

      for (const origin of [undefined, ELSEWHERE, ADMIN, API, "null"]) {
        expect((await send("GET", "/v1/stations", { origin })).status).toBe(401);
      }
      // Nothing of an account, which a visitor has not.
      expect((await send("GET", "/v1/spots", { origin: APP })).status).toBe(401);
      expect((await send("GET", "/v1/account", { origin: APP })).status).toBe(401);
    });

    it("is asked for an account once an operator closes the instance, and told so on both transports", async () => {
      const cookie = await signUpOperator();
      expect(await bodyOf(await send("GET", "/v1/visitors"))).toEqual({ open: true });

      // The instance is closed from the admin's site, and from no page of the web app.
      const close = { cookie, body: { open: false } };
      expect((await send("PUT", "/v1/visitors", { ...close, origin: APP })).status).toBe(403);
      expect((await send("GET", "/v1/stations", { origin: APP })).status).toBe(200);
      expect((await send("PUT", "/v1/visitors", { ...close, origin: ADMIN })).status).toBe(200);

      const refusal = { code: "UNAUTHORIZED", data: { visitors: "closed" } };
      const read = await send("GET", "/v1/stations", { origin: APP });
      expect([read.status, await bodyOf(read)]).toMatchObject([401, refusal]);
      const called = await send("POST", "/rpc/v1/stations/list", {
        origin: APP,
        body: { json: {} },
      });
      expect([called.status, await bodyOf(called)]).toMatchObject([401, { json: refusal }]);
      expect(await bodyOf(await send("GET", "/v1/visitors", { origin: APP }))).toEqual({
        open: false,
      });

      // An account reads as before, and whoever comes from elsewhere is told nothing more.
      expect((await send("GET", "/v1/stations", { cookie, origin: APP })).status).toBe(200);
      const elsewhere = await bodyOf<{ data?: unknown }>(await send("GET", "/v1/stations"));
      expect(elsewhere.data).toBeUndefined();

      const open = { cookie, origin: ADMIN, body: { open: true } };
      expect(await bodyOf(await send("PUT", "/v1/visitors", open))).toEqual({
        open: true,
        closedAt: null,
        busy: false,
      });
      expect((await send("GET", "/v1/stations", { origin: APP })).status).toBe(200);
    });
  });

  describe("the counts", () => {
    it("name a procedure the same on both transports, and count what was refused", async () => {
      const cookie = await signUpOperator();
      const { key, id: keyId } = await makeKey(cookie);
      await usage.flush();
      await database.db.delete(apiUsage);

      await send("GET", "/v1/stations", { key });
      await send("POST", "/rpc/v1/stations/list", { key, body: { json: {} } });
      await send("GET", "/v1/stations", {});
      await send("GET", "/v1/keys", { cookie, origin: APP });
      // Neither of these reaches a procedure: an address that is no route, and a body that
      // cannot be read.
      await send("GET", "/v1/nothing", { key });
      await app.request("/v1/developers", {
        method: "POST",
        headers: { Cookie: cookie, Origin: ADMIN, "Content-Type": "application/json" },
        body: "{ not json",
      });
      await usage.flush();

      const rows = await database.db.select().from(apiUsage);
      const counted = rows
        .map((row) => [row.via, row.keyId, row.procedure, row.outcome, row.calls])
        .sort();
      expect(counted).toEqual([
        ["key", keyId, "v1.stations.list", "answered", 2],
        ["none", null, "v1.stations.list", "refused", 1],
        ["session", null, "v1.keys.list", "refused", 1],
      ]);
    });
  });

  describe("the MCP server", () => {
    // One message of the protocol, as an agent's client posts it.
    const post = (message: object, headers: Record<string, string> = {}) =>
      app.request("/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          ...headers,
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, ...message }),
      });
    // What the server answered a message: as JSON, or as the one event of a stream.
    async function resultOf<Result>(response: Response) {
      const text = await response.text();
      const data = /^data: (.+)$/m.exec(text)?.[1] ?? text;
      return (JSON.parse(data) as { result: Result }).result;
    }

    it("lists its tools to a key, and counts a call to one as a call to its route", async () => {
      const cookie = await signUpOperator();
      const { key, id } = await makeKey(cookie);
      const by = { Authorization: `Bearer ${key}` };

      const listed = await post({ method: "tools/list" }, by);
      expect([listed.status, listed.headers.get("Cache-Control")]).toEqual([200, NOT_CACHED]);
      const { tools } = await resultOf<{ tools: { name: string }[] }>(listed);
      expect(tools.map((tool) => tool.name)).toContain("get_forecast");

      const called = await post(
        { method: "tools/call", params: { name: "list_stations", arguments: {} } },
        by,
      );
      expect([called.status, called.headers.get("Cache-Control")]).toEqual([200, NOT_CACHED]);
      const { content } = await resultOf<{ content: { text: string }[] }>(called);
      expect(JSON.parse(content[0]?.text ?? "")).toEqual({ stations: [] });

      await usage.flush();
      const counted = await database.db.select().from(apiUsage);
      // The call is the key's, under the route's own name, whatever carried it.
      expect(
        counted
          .filter((row) => row.via === "key")
          .map(({ keyId, procedure, outcome, calls }) => ({ keyId, procedure, outcome, calls })),
      ).toEqual([{ keyId: id, procedure: "v1.stations.list", outcome: "answered", calls: 1 }]);
    });

    it("refuses a request with no key, an account's session too", async () => {
      const cookie = await signUpOperator();
      const without: Record<string, string>[] = [
        {},
        { Cookie: cookie },
        { Cookie: cookie, Origin: APP },
      ];
      for (const headers of without) {
        const refused = await post({ method: "tools/list" }, headers);
        expect([refused.status, refused.headers.get("Cache-Control")]).toEqual([401, NOT_CACHED]);
        // The cookie of a session is no sign-in here: the refusal says where an agent signs in.
        expect(refused.headers.get("WWW-Authenticate")).toMatch(/^Bearer resource_metadata="/);
      }
    });
  });

  describe("an agent that an account signs in", () => {
    const RESOURCE = `${API}/mcp`;
    const CALLBACK = "https://agent.example/callback";
    const VERIFIER = "a-verifier-made-up-for-these-tests-and-long-enough";
    const challengeOf = async (verifier: string) =>
      Buffer.from(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
      ).toString("base64url");
    const form = (path: string, fields: Record<string, string>) =>
      app.request(path, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(fields),
      });
    const rpc = (message: object, token: string) =>
      app.request("/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, ...message }),
      });
    async function resultOf<Result>(response: Response) {
      const text = await response.text();
      const data = /^data: (.+)$/m.exec(text)?.[1] ?? text;
      return (JSON.parse(data) as { result: Result }).result;
    }

    /** A client registers itself, as an assistant does when the server is added to it. */
    async function register(addresses = [CALLBACK]) {
      const made = await send("POST", "/api/auth/oauth2/register", {
        body: {
          client_name: "An assistant",
          redirect_uris: addresses,
          token_endpoint_auth_method: "none",
          grant_types: ["authorization_code", "refresh_token"],
        },
      });
      return { status: made.status, ...(await bodyOf<{ client_id?: string }>(made)) };
    }

    /** The client sends the account's browser to the API, which sends it on to the page. */
    async function authorize(clientId: string, cookie?: string) {
      const asked = new URLSearchParams({
        response_type: "code",
        client_id: clientId,
        redirect_uri: CALLBACK,
        state: "a-state",
        code_challenge: await challengeOf(VERIFIER),
        code_challenge_method: "S256",
        resource: RESOURCE,
        scope: "read offline_access",
      });
      const sent = await send("GET", `/api/auth/oauth2/authorize?${asked}`, { cookie });
      const page = new URL(sent.headers.get("location") ?? "about:blank");
      // What the API signed comes after `#`, where the web app's server does not read it.
      return { address: `${page.origin}${page.pathname}`, query: page.hash.replace(/^#\?/, "") };
    }

    /** The account agrees on the page, and the client trades what it is given for a token. */
    async function signIn(cookie: string, clientId: string) {
      const page = await authorize(clientId, cookie);
      const agreed = await send("POST", "/api/auth/oauth2/consent", {
        cookie,
        origin: APP,
        body: { accept: true, oauth_query: page.query },
      });
      const back = new URL((await bodyOf<{ url: string }>(agreed)).url);
      const traded = await form("/api/auth/oauth2/token", {
        grant_type: "authorization_code",
        code: back.searchParams.get("code") ?? "",
        redirect_uri: CALLBACK,
        client_id: clientId,
        code_verifier: VERIFIER,
        resource: RESOURCE,
      });
      return {
        page,
        back,
        status: traded.status,
        ...(await bodyOf<{ access_token: string; refresh_token?: string; scope?: string }>(traded)),
      };
    }

    it("says where an account signs in, to a client that was refused", async () => {
      const refused = await rpc({ method: "tools/list" }, "no-token-of-this-instance");
      expect(refused.status).toBe(401);
      const told = refused.headers.get("WWW-Authenticate") ?? "";
      expect(told).toBe(
        `Bearer resource_metadata="${API}/.well-known/oauth-protected-resource/mcp", ` +
          'scope="read offline_access"',
      );

      for (const path of [
        "/.well-known/oauth-protected-resource/mcp",
        "/.well-known/oauth-protected-resource",
      ]) {
        const resource = await send("GET", path);
        expect(await bodyOf(resource)).toMatchObject({
          resource: RESOURCE,
          authorization_servers: [`${API}/api/auth`],
          scopes_supported: ["read", "offline_access"],
        });
      }
      const server = await bodyOf<Record<string, unknown>>(
        await send("GET", "/.well-known/oauth-authorization-server/api/auth"),
      );
      expect(server).toMatchObject({
        issuer: `${API}/api/auth`,
        authorization_endpoint: `${API}/api/auth/oauth2/authorize`,
        token_endpoint: `${API}/api/auth/oauth2/token`,
        registration_endpoint: `${API}/api/auth/oauth2/register`,
        code_challenge_methods_supported: ["S256"],
      });
      // No scope says who the account is.
      expect(server.scopes_supported).toEqual(["read", "offline_access"]);
    });

    it("sends whoever is not signed in to the web app's page, then asks the account", async () => {
      const { client_id: clientId } = await register();
      const stranger = await authorize(clientId ?? "");
      expect(stranger.address).toBe(`${APP}/connect`);
      expect(new URLSearchParams(stranger.query).get("client_id")).toBe(clientId);

      const cookie = await signUp("ana");
      const asked = await authorize(clientId ?? "", cookie);
      expect(asked.address).toBe(`${APP}/connect`);
      expect(new URLSearchParams(asked.query).get("scope")).toBe("read offline_access");
      // What the page shows of the client: the name it gave itself.
      const shown = await send("GET", `/api/auth/oauth2/public-client?client_id=${clientId}`, {
        cookie,
      });
      expect(await bodyOf(shown)).toMatchObject({ client_name: "An assistant" });
    });

    it("gives the agent its account's tools, counted with the accounts as calls by MCP", async () => {
      const cookie = await signUp("ana");
      const { client_id: clientId } = await register();
      const signed = await signIn(cookie, clientId ?? "");
      expect(signed.back.origin + signed.back.pathname).toBe(CALLBACK);
      expect([signed.status, signed.scope]).toEqual([200, "read offline_access"]);
      expect(signed.refresh_token).toBeTruthy();

      const listed = await rpc({ method: "tools/list" }, signed.access_token);
      expect([listed.status, listed.headers.get("Cache-Control")]).toEqual([200, NOT_CACHED]);
      const { tools } = await resultOf<{ tools: { name: string }[] }>(listed);
      expect(tools.map((tool) => tool.name)).toEqual(
        expect.arrayContaining(["list_my_spots", "list_my_alerts", "get_forecast"]),
      );

      await send("POST", "/v1/spots", {
        cookie,
        origin: APP,
        body: { name: "Ana's reef", latitude: 43.6, longitude: -1.4 },
      });
      await usage.flush();
      await database.db.delete(apiUsage);
      const called = await rpc(
        { method: "tools/call", params: { name: "list_my_spots", arguments: {} } },
        signed.access_token,
      );
      const { content } = await resultOf<{ content: { text: string }[] }>(called);
      const { spots } = JSON.parse(content[0]?.text ?? "") as { spots: { name: string }[] };
      expect(spots.map((found) => found.name)).toEqual(["Ana's reef"]);

      await usage.flush();
      const counted = await database.db.select().from(apiUsage);
      expect(
        counted.map(({ via, way, keyId, procedure, calls }) => ({
          via,
          way,
          keyId,
          procedure,
          calls,
        })),
      ).toEqual([
        { via: "session", way: "mcp", keyId: null, procedure: "v1.spots.list", calls: 1 },
      ]);

      // The token opens the MCP server, and nothing else of the API.
      expect((await send("GET", "/v1/spots", { key: signed.access_token })).status).toBe(401);
    });

    it("is out at once when the account is suspended, or takes its word back", async () => {
      const operatorCookie = await signUpOperator();
      const cookie = await signUp("ana");
      const account = await bodyOf<{ id: string }>(await send("GET", "/v1/account", { cookie }));
      const { client_id: clientId } = await register();
      const { access_token: token } = await signIn(cookie, clientId ?? "");
      expect((await rpc({ method: "tools/list" }, token)).status).toBe(200);

      await send("PATCH", `/v1/accounts/${account.id}`, {
        cookie: operatorCookie,
        origin: ADMIN,
        body: { suspended: true },
      });
      expect((await rpc({ method: "tools/list" }, token)).status).toBe(401);
      await send("PATCH", `/v1/accounts/${account.id}`, {
        cookie: operatorCookie,
        origin: ADMIN,
        body: { suspended: false },
      });
      expect((await rpc({ method: "tools/list" }, token)).status).toBe(200);

      await database.db.delete(oauthConsent);
      expect((await rpc({ method: "tools/list" }, token)).status).toBe(401);
    });

    it("lets the account see its assistants, and take its word back from one", async () => {
      const cookie = await signUp("ana");
      const other = await signUp("ben");
      const { client_id: clientId } = await register();
      const signed = await signIn(cookie, clientId ?? "");

      const listed = await bodyOf<{ agents: { clientId: string; name: string | null }[] }>(
        await send("GET", "/v1/agents", { cookie }),
      );
      expect(listed.agents).toMatchObject([{ clientId, name: "An assistant" }]);
      // Another account has none, and takes nothing back from this one.
      expect(await bodyOf(await send("GET", "/v1/agents", { cookie: other }))).toEqual({
        agents: [],
      });
      const notMine = await send("DELETE", `/v1/agents/${clientId}`, {
        cookie: other,
        origin: APP,
      });
      expect(notMine.status).toBe(404);
      expect((await rpc({ method: "tools/list" }, signed.access_token)).status).toBe(200);

      const taken = await send("DELETE", `/v1/agents/${clientId}`, { cookie, origin: APP });
      expect(taken.status).toBe(200);
      // The token it holds opens nothing more, and what it kept gets it no new one.
      expect((await rpc({ method: "tools/list" }, signed.access_token)).status).toBe(401);
      const again = await form("/api/auth/oauth2/token", {
        grant_type: "refresh_token",
        refresh_token: signed.refresh_token ?? "",
        client_id: clientId ?? "",
        resource: RESOURCE,
      });
      expect(again.status).toBe(400);
      expect(await bodyOf(await send("GET", "/v1/agents", { cookie }))).toEqual({ agents: [] });
    });

    it("trades what it kept for a new token, while the account agrees", async () => {
      const cookie = await signUp("ana");
      const { client_id: clientId } = await register();
      const signed = await signIn(cookie, clientId ?? "");
      const again = await form("/api/auth/oauth2/token", {
        grant_type: "refresh_token",
        refresh_token: signed.refresh_token ?? "",
        client_id: clientId ?? "",
        resource: RESOURCE,
      });
      expect(again.status).toBe(200);
      const { access_token: token } = await bodyOf<{ access_token: string }>(again);
      expect((await rpc({ method: "tools/list" }, token)).status).toBe(200);
    });

    it("gives no token to an account that says no", async () => {
      const cookie = await signUp("ana");
      const { client_id: clientId } = await register();
      const page = await authorize(clientId ?? "", cookie);
      const refused = await send("POST", "/api/auth/oauth2/consent", {
        cookie,
        origin: APP,
        body: { accept: false, oauth_query: page.query },
      });
      const back = new URL((await bodyOf<{ url: string }>(refused)).url);
      expect(back.searchParams.get("error")).toBe("access_denied");
      expect(back.searchParams.get("code")).toBeNull();
    });

    it("takes a client of the account's own machine, and lets no account make a client", async () => {
      // A terminal or a desktop app is sent back to the machine it runs on.
      expect((await register(["http://localhost:53682/callback"])).status).toBe(201);
      expect((await register(["com.example.agent:/callback"])).status).toBe(201);
      // The library takes an app's own scheme only when it is named after a domain.
      expect((await register(["agent://callback"])).status).toBe(400);
      // An address of the web that is not kept from being read on the way is refused.
      expect((await register(["http://agent.example/callback"])).status).toBe(400);

      const cookie = await signUp("ana");
      const made = await send("POST", "/api/auth/oauth2/create-client", {
        cookie,
        origin: APP,
        body: { client_name: "Mine", redirect_uris: [CALLBACK] },
      });
      expect(made.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("the log", () => {
    it("leaves out what follows the question mark, and what a refused request held", async () => {
      const cookie = await signUpOperator();
      logged.mockClear();
      const faults = vi.mocked(console.error);
      faults.mockClear();

      await send("GET", "/v1/accounts?q=someone%40example.org", { cookie, origin: ADMIN });
      await send("POST", "/v1/developers", {
        cookie,
        origin: ADMIN,
        body: { name: "", contact: "someone@example.org" },
      });

      const lines: string[] = logged.mock.calls.map((line: unknown[]) => String(line[0]));
      expect(lines.filter((line) => line.includes("/v1/accounts"))).toHaveLength(2);
      expect(lines.join("\n")).not.toContain("someone");
      expect(lines.join("\n")).not.toContain("?");
      expect(faults).not.toHaveBeenCalled();
    });
  });

  describe("the link of an alert mail", () => {
    // An account that said yes to mail, and the address its mails' header carries.
    async function link() {
      const cookie = await signUp("reader");
      const set = await send("PATCH", "/v1/alert-settings", {
        cookie,
        origin: APP,
        body: { byMail: true },
      });
      expect(set.status).toBe(200);
      const [row] = await database.db.select().from(alertSettings);
      if (!row?.mailKey) throw new Error("no key was made");
      return {
        key: row.mailKey,
        path: `/v1/alert-mails/off?u=${row.userId}&k=${row.mailKey}`,
        byMail: async () => (await database.db.select().from(alertSettings))[0]?.byMail,
      };
    }
    // As a mail program presses "unsubscribe": a form, with no cookie and no site.
    const press = (path: string) =>
      app.request(path, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "List-Unsubscribe=One-Click",
      });

    it("stops the mails for a mail program that posts to it, with no session and no key", async () => {
      const { path, key, byMail } = await link();
      logged.mockClear();

      const wrong = await press(path.replace(key, "not-the-key"));
      expect([wrong.status, await bodyOf(wrong)]).toEqual([200, { off: false }]);
      expect(await byMail()).toBe(true);

      const pressed = await press(`${path}&l=fr`);
      expect([pressed.status, await bodyOf(pressed)]).toEqual([200, { off: true }]);
      expect(await byMail()).toBe(false);
      // Once.
      expect(await bodyOf(await press(path))).toEqual({ off: false });

      // The log holds the route, and nothing of the link.
      const lines = logged.mock.calls.map((line: unknown[]) => String(line[0])).join("\n");
      expect(lines).toContain("/v1/alert-mails/off");
      expect(lines).not.toContain(key);
    });

    it("leads who opens it to the page that asks, and stops nothing by that", async () => {
      const { path, key, byMail } = await link();

      // As the header of a mail in French carries it.
      const opened = await app.request(`${path}&l=fr`, { redirect: "manual" });
      expect(opened.status).toBe(303);
      expect(opened.headers.get("Location")).toBe(
        `${APP}/fr/mail-off?${new URL(path, APP).searchParams}`,
      );
      expect(opened.headers.get("Location")).toContain(key);
      expect(await byMail()).toBe(true);
    });
  });

  describe("a browser's push subscription", () => {
    // A pair's public key and a browser's subscription, made for these tests.
    const INSTANCE_KEY = makeVapidKeys().publicKey;
    const ADDRESS = "https://fcm.googleapis.com/fcm/send/kept-out";
    const browser = (endpoint = ADDRESS) => ({
      endpoint,
      keys: testReceiver().keys,
      label: "Chrome · macOS",
    });
    let pushing: ReturnType<typeof createApp>;
    beforeAll(() => {
      pushing = make(env, { on: false }, testPlaces().places, INSTANCE_KEY).app;
    });
    const subscriptions = () => database.db.select().from(pushSubscription);

    it("gives the web app the key of an instance that sends push, and none of one that does not", async () => {
      const cookie = await signUp("reader");

      const overRest = await send("GET", "/v1/push/key", { cookie }, pushing);
      expect([overRest.status, await bodyOf(overRest)]).toEqual([200, { publicKey: INSTANCE_KEY }]);
      const overRpc = await send(
        "POST",
        "/rpc/v1/push/key",
        { cookie, origin: APP, body: {} },
        pushing,
      );
      expect(await bodyOf(overRpc)).toEqual({ json: { publicKey: INSTANCE_KEY } });

      expect(await bodyOf(await send("GET", "/v1/push/key", { cookie }))).toEqual({
        publicKey: null,
      });
      expect((await send("GET", "/v1/push/key", {}, pushing)).status).toBe(401);
    });

    it("takes an address in a request's body, and gives it back in no answer and no log", async () => {
      const cookie = await signUp("reader");
      const from = { cookie, origin: APP };
      logged.mockClear();
      const faults = vi.mocked(console.error);
      faults.mockClear();
      const answers: string[] = [];
      const ask = async (method: string, path: string, body?: unknown) => {
        const response = await send(method, path, { ...from, body }, pushing);
        const text = await response.text();
        answers.push(text);
        return { status: response.status, body: JSON.parse(text) as Record<string, unknown> };
      };

      const made = await ask("POST", "/v1/push/devices", browser());
      expect(made.status).toBe(201);
      expect(Object.keys(made.body).sort()).toEqual(["createdAt", "id", "label", "seenAt"]);
      const id = String(made.body.id);
      expect((await ask("POST", "/v1/push/devices/renew", { id, ...browser() })).status).toBe(200);
      expect((await ask("POST", "/v1/push/devices/renew", browser())).status).toBe(200);
      expect((await ask("POST", "/rpc/v1/push/renew", { json: { id, ...browser() } })).status).toBe(
        200,
      );
      expect((await ask("GET", "/v1/push/devices")).body).toMatchObject({ devices: [{ id }] });
      // An address that is no push service's, and one the caller has no device for.
      const refused = browser("https://push.example.org/kept-out");
      expect((await ask("POST", "/v1/push/devices", refused)).status).toBe(400);
      expect((await ask("POST", "/rpc/v1/push/subscribe", { json: refused })).status).toBe(400);
      // A device the caller has not: an address nothing kept, with an id and without one.
      const unkept = browser("https://fcm.googleapis.com/fcm/send/kept-out-too");
      for (const named of [{ id: crypto.randomUUID(), ...unkept }, unkept]) {
        expect((await ask("POST", "/v1/push/devices/renew", named)).status).toBe(404);
      }
      // An id that is an address is refused as it comes, in a body or in a URL.
      expect(
        (await ask("POST", "/v1/push/devices/renew", { ...browser(), id: ADDRESS })).status,
      ).toBe(400);
      expect((await ask("DELETE", `/v1/push/devices/${encodeURIComponent(ADDRESS)}`)).status).toBe(
        400,
      );
      expect(await subscriptions()).toMatchObject([{ id, endpoint: ADDRESS }]);
      expect((await ask("POST", "/v1/push/devices/forget", { endpoint: ADDRESS })).body).toEqual({
        forgotten: true,
      });
      expect(await subscriptions()).toEqual([]);

      const lines = logged.mock.calls.map((line: unknown[]) => String(line[0])).join("\n");
      expect(lines).toContain("/v1/push/devices");
      expect(`${answers.join("\n")}\n${lines}`).not.toContain("kept-out");
      expect(faults).not.toHaveBeenCalled();
    });

    it("forgets a browser when its account signs out there, and no other of its browsers", async () => {
      const here = await signUp("reader");
      // The same account, signed in in another browser.
      const signedIn = await send("POST", "/api/auth/sign-in/email", {
        origin: APP,
        body: { email: "reader@example.org", password: "made-up-for-these-tests" },
      });
      const elsewhere = signedIn.headers
        .getSetCookie()
        .map((set) => set.split(";")[0])
        .join("; ");
      const made = async (cookie: string, endpoint: string) => {
        const answer = await send(
          "POST",
          "/v1/push/devices",
          { cookie, origin: APP, body: browser(endpoint) },
          pushing,
        );
        expect(answer.status).toBe(201);
      };
      await made(here, "https://fcm.googleapis.com/fcm/send/this-browser");
      await made(elsewhere, "https://fcm.googleapis.com/fcm/send/another-browser");

      const out = await send("POST", "/api/auth/sign-out", { cookie: here, origin: APP, body: {} });
      expect(out.status).toBe(200);

      // The session is gone, and the device that was made in it with it.
      expect((await subscriptions()).map((row) => row.endpoint)).toEqual([
        "https://fcm.googleapis.com/fcm/send/another-browser",
      ]);
      expect((await send("GET", "/v1/push/devices", { cookie: here }, pushing)).status).toBe(401);
    });

    it("takes no address in a URL, on either transport", async () => {
      const cookie = await signUp("reader");
      const subscription = browser();
      const data = encodeURIComponent(JSON.stringify({ json: subscription }));
      const query = new URLSearchParams({
        endpoint: subscription.endpoint,
        "keys[p256dh]": subscription.keys.p256dh,
        "keys[auth]": subscription.keys.auth,
      });

      logged.mockClear();
      for (const path of [
        `/rpc/v1/push/subscribe?data=${data}`,
        `/rpc/v1/push/forget?data=${data}`,
        `/v1/push/devices?${query}`,
        `/v1/push/devices/forget?${query}`,
      ]) {
        await send("GET", path, { cookie, origin: APP }, pushing);
      }
      expect(await subscriptions()).toEqual([]);
      // A caller that puts one there all the same leaves nothing of it in the log.
      const lines = logged.mock.calls.map((line: unknown[]) => String(line[0])).join("\n");
      expect(lines).toContain("/v1/push/devices");
      expect(lines).not.toContain("kept-out");

      // The reference shows no route of push that reads its address from the query.
      const spec = await bodyOf<{
        paths: Record<string, Record<string, { parameters?: { in: string }[] }>>;
      }>(await send("GET", "/v1/openapi.json"));
      const routes = Object.entries(spec.paths).filter(([path]) => path.startsWith("/push"));
      expect(routes.map(([path]) => path).sort()).toEqual([
        "/push/devices",
        "/push/devices/forget",
        "/push/devices/renew",
        "/push/devices/{id}",
        "/push/key",
      ]);
      for (const [path, operations] of routes) {
        for (const [method, operation] of Object.entries(operations)) {
          const inQuery = (operation.parameters ?? []).filter((one) => one.in === "query");
          expect(inQuery, `${method} ${path}`).toEqual([]);
        }
      }
    });
  });

  // What others read of an account: decision 041.
  describe("an account's username", () => {
    const password = "made-up-for-these-tests";
    const signUpAs = (username: string, email = `${username.toLowerCase()}@example.org`) =>
      send("POST", "/api/auth/sign-up/email", {
        origin: APP,
        body: { name: username, username, email, password },
      });
    const cookieOf = (response: Response) =>
      response.headers
        .getSetCookie()
        .map((set) => set.split(";")[0])
        .join("; ");
    const accountOf = async (cookie: string) =>
      bodyOf<{ id: string; username: string | null }>(await send("GET", "/v1/account", { cookie }));
    const choose = (cookie: string, username: string) =>
      send("POST", "/api/auth/update-user", { cookie, origin: APP, body: { username } });

    it("is taken at sign-up, kept in small letters, and answered with the account", async () => {
      const made = await signUpAs("Ana_29");
      expect(made.status).toBe(200);

      expect((await accountOf(cookieOf(made))).username).toBe("ana_29");
      const [kept] = await database.db.select().from(user);
      expect(kept?.username).toBe("ana_29");
    });

    it("is one account's alone, whatever its capitals", async () => {
      expect((await signUpAs("Ana")).status).toBe(200);
      const second = await signUpAs("ANA", "other@example.org");

      expect(second.status).toBe(400);
      expect(await database.db.select().from(user)).toHaveLength(1);
    });

    it("is refused too short, too long, in other characters, or as a name nobody takes", async () => {
      for (const username of ["ab", "a".repeat(21), "ana maria", "océane", "Admin", "tonnr"]) {
        expect((await signUpAs(username, "someone@example.org")).status, username).toBe(400);
      }
      expect(await database.db.select().from(user)).toEqual([]);
    });

    it("opens no session: an account signs in by its address", async () => {
      await signUpAs("Ana");
      const attempt = await send("POST", "/api/auth/sign-in/username", {
        origin: APP,
        body: { username: "Ana", password },
      });

      expect(attempt.status).toBe(404);
      expect(await database.db.select().from(session)).toHaveLength(1);
    });

    it("is chosen later by an account that has none, and says whether it is free", async () => {
      const ben = await signUp("ben");
      expect((await accountOf(ben)).username).toBeNull();

      const free = (username: string) =>
        send("POST", "/api/auth/is-username-available", { origin: APP, body: { username } });
      expect(await bodyOf(await free("Ben_K"))).toEqual({ available: true });
      expect((await choose(ben, "Ben_K")).status).toBe(200);
      expect((await accountOf(ben)).username).toBe("ben_k");
      expect(await bodyOf(await free("ben_k"))).toEqual({ available: false });

      // Another account does not take it, and its own stays what it was.
      const cleo = await signUp("cleo");
      expect((await choose(cleo, "BEN_K")).status).toBe(400);
      expect((await accountOf(cleo)).username).toBeNull();
      // Its owner takes another, and the first is free again.
      expect((await choose(ben, "ben_the_second")).status).toBe(200);
      expect(await bodyOf(await free("Ben_K"))).toEqual({ available: true });
    });

    it("takes no second form beside it, in which an account would write another's", async () => {
      const ana = cookieOf(await signUpAs("Ana"));
      const written = await send("POST", "/api/auth/update-user", {
        cookie: ana,
        origin: APP,
        body: { displayUsername: "ben" },
      });

      // The library ignores a field it does not know, or refuses it: either way nothing is kept.
      expect([200, 400]).toContain(written.status);
      expect((await accountOf(ana)).username).toBe("ana");
      const [kept] = await database.db.select().from(user);
      expect(Object.keys(kept ?? {})).not.toContain("displayUsername");
    });

    it("is taken away by an operator, in a record that does not hold it", async () => {
      const operatorCookie = await signUpOperator();
      const from = { cookie: operatorCookie, origin: ADMIN };
      const ana = cookieOf(await signUpAs("Ana"));
      const { id } = await accountOf(ana);

      // The web app's pages do not run the instance, an operator's session or not.
      const fromApp = await send("DELETE", `/v1/accounts/${id}/username`, {
        cookie: operatorCookie,
        origin: APP,
      });
      expect(fromApp.status).toBe(403);
      expect((await send("DELETE", `/v1/accounts/${id}/username`, { cookie: ana })).status).toBe(
        403,
      );

      const taken = await send("DELETE", `/v1/accounts/${id}/username`, from);
      expect([taken.status, (await bodyOf<{ username: unknown }>(taken)).username]).toEqual([
        200,
        null,
      ]);
      expect((await accountOf(ana)).username).toBeNull();
      // Taking away what is not there records nothing more.
      expect((await send("DELETE", `/v1/accounts/${id}/username`, from)).status).toBe(200);

      const { actions } = await bodyOf<{ actions: { action: string; accountId: string }[] }>(
        await send("GET", "/v1/actions", from),
      );
      const recorded = actions.filter((one) => one.action === "account.username_remove");
      expect(recorded).toMatchObject([{ accountId: id }]);
      // The account's name is what it signed up with: the record holds neither.
      expect(JSON.stringify(recorded.map((one) => ({ ...one, accountName: null })))).not.toContain(
        "Ana",
      );
      // Nobody takes that username again: not the account, and no other.
      expect((await choose(ana, "Ana")).status).toBe(400);
      expect((await signUpAs("ana", "second@example.org")).status).toBe(400);
      expect((await choose(ana, "Ana_M")).status).toBe(200);
    });

    it("stays away once an operator took it, when a write that was under way puts it back", async () => {
      const ana = cookieOf(await signUpAs("Ana"));
      // An operator took the username away at the moment the account sent it again: the
      // library had checked it before, and wrote it after. The table says it was removed.
      await database.db.insert(removedUsername).values({ username: "ana" });

      // The next thing the library writes of the account takes it off.
      const written = await send("POST", "/api/auth/update-user", {
        cookie: ana,
        origin: APP,
        body: { name: "Ana Maria" },
      });

      expect(written.status).toBe(200);
      expect((await accountOf(ana)).username).toBeNull();
    });

    it("is changed for another, and not taken off by its account", async () => {
      const ana = cookieOf(await signUpAs("Ana"));
      for (const username of [null, 12, ""]) {
        const cleared = await send("POST", "/api/auth/update-user", {
          cookie: ana,
          origin: APP,
          body: { username },
        });
        expect(cleared.status, String(username)).toBe(400);
      }
      expect((await accountOf(ana)).username).toBe("ana");
      // What else an account says of itself is taken as before.
      const renamed = await send("POST", "/api/auth/update-user", {
        cookie: ana,
        origin: APP,
        body: { name: "Ana Maria" },
      });
      expect(renamed.status).toBe(200);
      expect((await accountOf(ana)).username).toBe("ana");
    });
  });

  // The link an account gives, and what signing up through it makes: decision 041.
  describe("an account made through another's link", () => {
    const password = "made-up-for-these-tests";
    const cookieOf = (response: Response) =>
      response.headers
        .getSetCookie()
        .map((set) => set.split(";")[0])
        .join("; ");
    const signUpAs = (username: string, invitation?: string) =>
      send("POST", "/api/auth/sign-up/email", {
        origin: APP,
        body: {
          name: username,
          username,
          email: `${username}@example.org`,
          password,
          ...(invitation !== undefined && { invitation }),
        },
      });
    const linkOf = async (cookie: string) =>
      (await bodyOf<{ token: string }>(await send("GET", "/v1/friends/link", { cookie }))).token;
    type Friend = { username: string | null; sponsored: string | null };
    const friendsOf = async (cookie: string) =>
      (await bodyOf<{ friends: Friend[] }>(await send("GET", "/v1/friends", { cookie }))).friends;

    it("has the link's owner as its sponsor, and the two are friends", async () => {
      const ana = cookieOf(await signUpAs("ana"));
      const token = await linkOf(ana);

      // Whoever was given the link reads whose it is before they sign up, with no account.
      const opened = await send("POST", "/v1/friends/open", { origin: APP, body: { token } });
      expect([opened.status, await bodyOf(opened)]).toEqual([200, { username: "ana", rank: null }]);

      const made = await signUpAs("ben", token);
      expect(made.status).toBe(200);
      const ben = cookieOf(made);

      expect(await friendsOf(ben)).toMatchObject([{ username: "ana", sponsored: null }]);
      expect(await friendsOf(ana)).toMatchObject([{ username: "ben", sponsored: "waiting" }]);
      expect(await database.db.select().from(sponsorship)).toHaveLength(1);
    });

    it("is made all the same with a link that opens nothing, and has no sponsor", async () => {
      const made = await signUpAs("ben", "no-such-link");

      expect(made.status).toBe(200);
      expect(await friendsOf(cookieOf(made))).toEqual([]);
      expect(await database.db.select().from(sponsorship)).toEqual([]);
    });

    it("is the only one with a sponsor: an account that exists becomes a friend, and no more", async () => {
      const ana = cookieOf(await signUpAs("ana"));
      const token = await linkOf(ana);
      const cleo = cookieOf(await signUpAs("cleo"));

      const accepted = await send("POST", "/v1/friends", {
        cookie: cleo,
        origin: APP,
        body: { token },
      });

      expect(accepted.status).toBe(200);
      expect(await friendsOf(ana)).toMatchObject([{ username: "cleo", sponsored: null }]);
      expect(await database.db.select().from(sponsorship)).toEqual([]);
    });

    it("is sponsored without a username, and makes friends once it has one", async () => {
      const ana = cookieOf(await signUpAs("ana"));
      const token = await linkOf(ana);
      const body = { name: "Dan", email: "dan@example.org", password, invitation: token };

      const made = await send("POST", "/api/auth/sign-up/email", { origin: APP, body });

      expect(made.status).toBe(200);
      expect(await database.db.select().from(sponsorship)).toHaveLength(1);
      expect(await friendsOf(ana)).toEqual([]);
      // A friend is read by a name: the account opens the link once it has one.
      const dan = cookieOf(made);
      const open = () => send("POST", "/v1/friends", { cookie: dan, origin: APP, body: { token } });
      expect((await open()).status).toBe(403);
      await send("POST", "/api/auth/update-user", {
        cookie: dan,
        origin: APP,
        body: { username: "dan" },
      });
      expect((await open()).status).toBe(200);
      expect(await friendsOf(ana)).toMatchObject([{ username: "dan", sponsored: "waiting" }]);
    });
  });

  it("serves the reference with a script whose version is named", async () => {
    const page = await (await send("GET", "/v1/docs")).text();

    expect(page).toMatch(/cdn\.jsdelivr\.net\/npm\/@scalar\/api-reference@\d+\.\d+\.\d+"/);
  });
});
