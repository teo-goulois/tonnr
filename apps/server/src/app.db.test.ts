import { createUsage, type Usage } from "@repo/api/usage";
import { createAuth } from "@repo/auth";
import { apiKey, apiUsage, developer, operator } from "@repo/db/schema/access";
import { user } from "@repo/db/schema/auth";
import { stationList } from "@repo/db/schema/lists";
import { createTestDatabase, TEST_DATABASE_URL } from "@repo/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "./app";

const API = "http://localhost:3000";
const APP = "http://localhost:3001";
const ADMIN = "http://localhost:3002";
const ELSEWHERE = "https://elsewhere.example";
const NOT_CACHED = "private, no-store";

type By = { cookie?: string; key?: string; origin?: string; referer?: string; body?: unknown };
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
  // An instance with an admin app, and one without.
  let app: ReturnType<typeof createApp>;
  let bare: ReturnType<typeof createApp>;
  let logged: ReturnType<typeof vi.spyOn>;

  const env = {
    BETTER_AUTH_URL: API,
    BETTER_AUTH_SECRET: "made-up-for-these-tests-and-long-enough",
    CORS_ORIGIN: APP,
  };

  beforeAll(async () => {
    database = await createTestDatabase();
    const { db } = database;
    // Counted in memory, and written only when a test asks.
    usage = createUsage(db, { every: null });
    const withAdmin = { ...env, ADMIN_ORIGIN: ADMIN };
    app = createApp({ env: withAdmin, db, auth: createAuth(withAdmin, db), usage });
    bare = createApp({ env, db, auth: createAuth(env, db), usage });
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
    "/v1/private-breaks",
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
    for (const path of [
      "/rpc/v1/stations/list",
      "/rpc/v1/privateBreaks/list",
      "/rpc/privateData",
    ]) {
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
    expect((await send("GET", "/v1/private-breaks", { key })).status).toBe(403);
    expect((await send("GET", "/v1/private-breaks", { key, cookie })).status).toBe(403);
    expect(
      (await send("GET", "/v1/stations", { key: `key_${"a".repeat(43)}`, cookie })).status,
    ).toBe(401);
  });

  it("refuses an account that is no operator what runs the instance, and the private list", async () => {
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
    for (const path of ["/v1/keys", "/v1/developers", "/v1/accounts", "/v1/private-breaks"]) {
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
      ["/usage/series", "get"],
      ["/usage/breakdown", "get"],
      ["/accounts", "get"],
      ["/actions", "get"],
      ["/private-breaks", "get"],
      ["/private-breaks/{id}", "get"],
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

      expect(() =>
        createApp({ env: same, db: database.db, auth: createAuth(same, database.db), usage }),
      ).toThrow("ADMIN_ORIGIN must not be the web app's address");
    });

    it("starts without a web app, with the admin at an address of its own or with none", () => {
      for (const addresses of [{ CORS_ORIGIN: API }, { CORS_ORIGIN: API, ADMIN_ORIGIN: ADMIN }]) {
        const alone = { ...env, ...addresses };

        expect(() =>
          createApp({ env: alone, db: database.db, auth: createAuth(alone, database.db), usage }),
        ).not.toThrow();
      }
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
