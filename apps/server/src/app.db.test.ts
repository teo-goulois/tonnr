import { testForecasts, testVerification } from "@repo/api/testing";
import { createUsage, type Usage } from "@repo/api/usage";
import { createAuth } from "@repo/auth";
import { suspensionHooks } from "@repo/auth/suspension";
import { providerCalls } from "@repo/db/schema/forecasts";
import { createEmailVerificationToken } from "better-auth/api";
import { accountSuspension, apiKey, apiUsage, developer, operator } from "@repo/db/schema/access";
import { session, user } from "@repo/db/schema/auth";
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
      verification: mail.verification,
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
      ["/actions", "get"],
      ["/instance", "get"],
      ["/lists", "get"],
      ["/spots", "post"],
      ["/notifications", "get"],
    ] as const) {
      expect(spec.paths[path]?.[method]?.security, `${method} ${path}`).toEqual([{ session: [] }]);
    }
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

  it("serves the reference with a script whose version is named", async () => {
    const page = await (await send("GET", "/v1/docs")).text();

    expect(page).toMatch(/cdn\.jsdelivr\.net\/npm\/@scalar\/api-reference@\d+\.\d+\.\d+"/);
  });
});
