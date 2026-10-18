import { inspect } from "node:util";

import { listTools } from "@repo/api/mcp";
import type { PrivateCatalogue } from "@repo/api/private-catalogue";
import { testForecasts, testPlaces, testVerification } from "@repo/api/testing";
import { createUsage, type Usage } from "@repo/api/usage";
import { createAuth } from "@repo/auth";
import { developer, operator } from "@repo/db/schema/access";
import { user } from "@repo/db/schema/auth";
import { createTestDatabase, TEST_DATABASE_URL } from "@repo/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "./app";

const API = "http://localhost:3000";
const WEB = "http://localhost:3001";
const ADMIN = "http://localhost:3002";
const NOT_CACHED = "private, no-store";
const SUMMARY_PATH = "/rpc/v1/privateCatalogue/summary";
// Entirely invented metadata. No source database, secret or upstream is used by these tests.
const SUMMARY = {
  configured: true as const,
  providers: [
    {
      id: "fixture-source",
      title: "A synthetic publisher",
      publisherGroup: "fixture-publisher",
      rightsStatus: "not_established",
      records: 2,
      snapshots: 3,
      claims: 4,
      resources: 1,
    },
  ],
  totals: { records: 2, snapshots: 3, claims: 4, resources: 1 },
  countries: [{ label: "Fixture country", records: 2 }],
};

type By = { cookie?: string; key?: string; origin?: string; body?: unknown };

describe.skipIf(!TEST_DATABASE_URL)("the private catalogue over HTTP", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let usage: Usage;
  let app: ReturnType<typeof createApp>;
  let unconfigured: ReturnType<typeof createApp>;
  const readSummary = vi.fn(async () => SUMMARY);
  const service: PrivateCatalogue = {
    summary: readSummary,
    records: vi.fn(),
    record: vi.fn(),
    claims: vi.fn(),
    resources: vi.fn(),
    snapshot: vi.fn(),
    close: vi.fn(async () => {}),
  };
  const env = {
    BETTER_AUTH_URL: API,
    BETTER_AUTH_SECRET: "invented-for-private-catalogue-http-tests-only",
    CORS_ORIGIN: WEB,
    ADMIN_ORIGIN: ADMIN,
  };

  beforeAll(async () => {
    database = await createTestDatabase();
    const { db } = database;
    usage = createUsage(db, { every: null });
    const { verification } = testVerification(db, { on: false, settings: env });
    const auth = createAuth(env, db, [], verification);
    const dependencies = {
      env,
      db,
      auth,
      usage,
      verification,
      forecasts: testForecasts().forecasts,
      places: testPlaces().places,
    };
    app = createApp({ ...dependencies, privateCatalogue: service });
    unconfigured = createApp(dependencies);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  beforeEach(async () => {
    await database.db.delete(developer);
    await database.db.delete(user);
    readSummary.mockReset().mockResolvedValue(SUMMARY);
    vi.mocked(console.error).mockClear();
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await database?.drop();
  });

  function send(method: string, path: string, by: By = {}, to = app) {
    const headers = new Headers();
    if (by.cookie) headers.set("Cookie", by.cookie);
    if (by.key) headers.set("Authorization", `Bearer ${by.key}`);
    if (by.origin) headers.set("Origin", by.origin);
    if (by.body === undefined) return to.request(path, { method, headers });
    headers.set("Content-Type", "application/json");
    return to.request(path, { method, headers, body: JSON.stringify(by.body) });
  }

  const summary = (by: By = {}, to = app) =>
    send("POST", SUMMARY_PATH, { ...by, body: { json: {} } }, to);

  async function account(name: string, isOperator = false) {
    const response = await send("POST", "/api/auth/sign-up/email", {
      origin: WEB,
      body: {
        name,
        email: `${name}@example.org`,
        password: "invented-private-catalogue-test-password",
      },
    });
    expect(response.status).toBe(200);
    const cookie = response.headers
      .getSetCookie()
      .map((one) => one.split(";")[0])
      .join("; ");
    const detail = await send("GET", "/v1/account", { cookie });
    const { id } = (await detail.json()) as { id: string };
    if (isOperator) await database.db.insert(operator).values({ userId: id });
    return { id, cookie };
  }

  async function keyFor(cookie: string) {
    const madeDeveloper = await send("POST", "/v1/developers", {
      cookie,
      origin: ADMIN,
      body: { name: "Synthetic catalogue test client" },
    });
    expect(madeDeveloper.status).toBe(201);
    const { id } = (await madeDeveloper.json()) as { id: string };
    const madeKey = await send("POST", "/v1/keys", {
      cookie,
      origin: ADMIN,
      body: { name: "Synthetic key", developerId: id },
    });
    expect(madeKey.status).toBe(201);
    return ((await madeKey.json()) as { key: string }).key;
  }

  it("answers an operator from the admin through RPC without caching the answer", async () => {
    const { cookie } = await account("operator", true);
    const response = await summary({ cookie, origin: ADMIN });

    expect([response.status, response.headers.get("Cache-Control")]).toEqual([200, NOT_CACHED]);
    expect(await response.json()).toEqual({ json: SUMMARY });
    expect(readSummary).toHaveBeenCalledTimes(1);
  });

  it("refuses a visitor and a regular account before consulting the private service", async () => {
    const { cookie } = await account("reader");
    for (const [by, status] of [
      [{}, 401],
      [{ origin: WEB }, 401],
      [{ cookie, origin: ADMIN }, 403],
    ] as const) {
      const response = await summary(by);
      expect([response.status, response.headers.get("Cache-Control")]).toEqual([
        status,
        NOT_CACHED,
      ]);
    }
    expect(readSummary).not.toHaveBeenCalled();
  });

  it("refuses an operator from the web app or without the admin site", async () => {
    const { cookie } = await account("operator", true);
    for (const by of [{ cookie, origin: WEB }, { cookie }]) {
      const response = await summary(by);
      expect([response.status, response.headers.get("Cache-Control")]).toEqual([403, NOT_CACHED]);
    }
    expect(readSummary).not.toHaveBeenCalled();
  });

  it("refuses a genuine API key even alongside an operator's session", async () => {
    const { cookie } = await account("operator", true);
    const key = await keyFor(cookie);
    for (const by of [
      { key, origin: ADMIN },
      { key, cookie, origin: ADMIN },
    ]) {
      const response = await summary(by);
      expect([response.status, response.headers.get("Cache-Control")]).toEqual([403, NOT_CACHED]);
    }
    expect(readSummary).not.toHaveBeenCalled();
  });

  it("checks current operator rights on each request", async () => {
    const { cookie } = await account("operator", true);
    expect((await summary({ cookie, origin: ADMIN })).status).toBe(200);
    readSummary.mockClear();
    await database.db.delete(operator);

    const response = await summary({ cookie, origin: ADMIN });
    expect([response.status, response.headers.get("Cache-Control")]).toEqual([403, NOT_CACHED]);
    expect(readSummary).not.toHaveBeenCalled();
  });

  it("tells only an authorized operator that the optional source is not configured", async () => {
    const { cookie } = await account("operator", true);
    const response = await summary({ cookie, origin: ADMIN }, unconfigured);

    expect([response.status, response.headers.get("Cache-Control")]).toEqual([200, NOT_CACHED]);
    expect(await response.json()).toMatchObject({ json: { configured: false } });
    expect(readSummary).not.toHaveBeenCalled();
    expect((await summary({}, unconfigured)).status).toBe(401);
  });

  it("returns a noncached generic failure without logging the upstream error", async () => {
    const { cookie } = await account("operator", true);
    const secret = "synthetic-catalogue-password-never-log";
    const sourceError = new Error(`postgresql://fixture:${secret}@database.invalid/private`);
    readSummary.mockRejectedValueOnce(sourceError);

    const response = await summary({ cookie, origin: ADMIN });
    expect([response.status, response.headers.get("Cache-Control")]).toEqual([503, NOT_CACHED]);
    expect(await response.text()).not.toContain(secret);
    const logs = vi
      .mocked(console.error)
      .mock.calls.map((args) => inspect(args, { depth: 10 }))
      .join("\n");
    expect(logs).not.toContain(secret);
    expect(logs).not.toContain("database.invalid");
  });

  it("does not advertise this RPC-only catalogue in public OpenAPI or MCP", async () => {
    const response = await send("GET", "/v1/openapi.json");
    expect(response.status).toBe(200);
    const spec = (await response.json()) as { paths: Record<string, unknown> };
    const privatePaths = Object.keys(spec.paths).filter((path) => /private.?catalogue/i.test(path));
    expect(privatePaths).toEqual([]);
    expect(JSON.stringify(spec).includes("privateCatalogue")).toBe(false);
    const tools = await listTools();
    expect(tools.map((tool) => tool.name).join(" ")).not.toMatch(/private.?catalogue/i);
    expect(readSummary).not.toHaveBeenCalled();
  });

  it("does not expose an inferred REST route even to an operator", async () => {
    const { cookie } = await account("operator", true);
    const response = await send("POST", "/v1/privateCatalogue/summary", {
      cookie,
      origin: ADMIN,
      body: {},
    });

    expect(response.status).toBe(404);
    expect(readSummary).not.toHaveBeenCalled();
  });
});
