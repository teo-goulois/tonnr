import { createAuth } from "@repo/auth";
import { apiKey, operator } from "@repo/db/schema/access";
import { user } from "@repo/db/schema/auth";
import { createTestDatabase, TEST_DATABASE_URL } from "@repo/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "./app";

const API = "http://localhost:3000";
const APP = "http://localhost:3001";
const ELSEWHERE = "https://elsewhere.example";
const NOT_CACHED = "private, no-store";

type By = { cookie?: string; key?: string; origin?: string; referer?: string; body?: unknown };
type MadeKey = { id: string; key: string };
type Spec = {
  components: { securitySchemes: Record<string, unknown> };
  security: unknown;
  paths: Record<string, Record<string, { security?: unknown }>>;
};

// An answer's body, read as what the route is known to give.
const bodyOf = async <Body>(response: Response) => (await response.json()) as Body;

describe.skipIf(!TEST_DATABASE_URL)("the API over HTTP", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    database = await createTestDatabase();
    const env = {
      BETTER_AUTH_URL: API,
      BETTER_AUTH_SECRET: "made-up-for-these-tests-and-long-enough",
      CORS_ORIGIN: APP,
    };
    app = createApp({ env, db: database.db, auth: createAuth(env, database.db) });
    // The app logs each request, and each refusal as an error.
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await database?.drop();
  });
  beforeEach(async () => {
    await database.db.delete(user);
  });

  function send(method: string, path: string, by: By = {}) {
    const headers = new Headers();
    if (by.cookie) headers.set("Cookie", by.cookie);
    if (by.key) headers.set("Authorization", `Bearer ${by.key}`);
    if (by.origin) headers.set("Origin", by.origin);
    if (by.referer) headers.set("Referer", by.referer);
    if (by.body === undefined) return app.request(path, { method, headers });

    headers.set("Content-Type", "application/json");
    return app.request(path, { method, headers, body: JSON.stringify(by.body) });
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
    "/v1/account",
    "/v1/lists",
  ])("refuses %s without a caller, and lets no cache keep the refusal", async (path) => {
    const response = await send("GET", path);

    expect([response.status, response.headers.get("Cache-Control")]).toEqual([401, NOT_CACHED]);
  });

  it("refuses the other transport the same way", async () => {
    for (const path of ["/rpc/v1/stations/list", "/rpc/v1/privateBreaks/list", "/rpc/privateData"]) {
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
    expect((await send("POST", "/rpc/v1/stations/list", { cookie, origin: APP, body: { json: {} } })).status).toBe(200);
  });

  it("answers a program by the key an operator made, on both transports", async () => {
    const cookie = await signUpOperator();

    const made = await send("POST", "/v1/keys", { cookie, origin: APP, body: { name: "a program" } });
    expect([made.status, made.headers.get("Cache-Control")]).toEqual([201, NOT_CACHED]);
    const { key } = await bodyOf<MadeKey>(made);

    expect((await send("GET", "/v1/stations", { key })).status).toBe(200);
    expect((await send("POST", "/rpc/v1/stations/list", { key, body: { json: {} } })).status).toBe(200);
    expect((await send("GET", "/v1/account", { key })).status).toBe(403);
    expect((await send("GET", "/v1/private-breaks", { key })).status).toBe(403);
    expect((await send("GET", "/v1/private-breaks", { key, cookie })).status).toBe(403);
    expect((await send("GET", "/v1/stations", { key: `key_${"a".repeat(43)}`, cookie })).status).toBe(401);
  });

  it("refuses an account that is no operator the keys and the private list", async () => {
    const cookie = await signUp("visitor");

    expect((await send("POST", "/v1/keys", { cookie, origin: APP, body: { name: "mine" } })).status).toBe(403);
    expect((await send("GET", "/v1/keys", { cookie })).status).toBe(403);
    expect((await send("GET", "/v1/private-breaks", { cookie })).status).toBe(403);
    expect(await keys()).toEqual([]);
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
      const cookie = await signUpOperator();

      const response = await send("POST", "/v1/keys", { cookie, body, ...from });
      const overRpc = await send("POST", "/rpc/v1/keys/create", { cookie, body: { json: body }, ...from });

      expect([response.status, response.headers.get("Cache-Control")]).toEqual([403, NOT_CACHED]);
      expect(overRpc.status).toBe(403);
      expect(await keys()).toEqual([]);
    });

    it("is refused as a form too, which a page can send without asking", async () => {
      const cookie = await signUpOperator();
      const headers = { Cookie: cookie, "Content-Type": "application/x-www-form-urlencoded" };

      const response = await app.request("/v1/keys", { method: "POST", headers, body: "name=evil" });

      expect(response.status).toBe(403);
      expect(await keys()).toEqual([]);
    });

    it.each<[string, By]>([
      ["the web app", { origin: APP }],
      ["the API's own reference", { origin: API }],
      ["a page of the web app that names itself by its address", { referer: `${APP}/app` }],
    ])("is taken from %s", async (_, from) => {
      const cookie = await signUpOperator();

      expect((await send("POST", "/v1/keys", { cookie, body, ...from })).status).toBe(201);
      expect(await keys()).toHaveLength(1);
    });

    it("does not concern a read, nor a write that carries a key and no cookie", async () => {
      const cookie = await signUpOperator();
      const made = await send("POST", "/v1/keys", { cookie, origin: APP, body });
      const { key } = await bodyOf<MadeKey>(made);

      expect((await send("GET", "/v1/stations", { cookie, origin: ELSEWHERE })).status).toBe(200);
      const read = { key, origin: ELSEWHERE, body: { json: {} } };
      expect((await send("POST", "/rpc/v1/stations/list", read)).status).toBe(200);
    });
  });

  it("revokes a key for the operator who made it, and the key stops at once", async () => {
    const cookie = await signUpOperator();
    const made = await bodyOf<MadeKey>(
      await send("POST", "/v1/keys", { cookie, origin: APP, body: { name: "short-lived" } }),
    );

    expect((await send("DELETE", `/v1/keys/${made.id}`, { cookie, origin: ELSEWHERE })).status).toBe(403);
    expect((await send("GET", "/v1/stations", { key: made.key })).status).toBe(200);

    expect((await send("DELETE", `/v1/keys/${made.id}`, { cookie, origin: APP })).status).toBe(200);
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
});
