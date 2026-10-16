import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { call } from "@orpc/server";
import type { Session } from "@repo/auth";
import { testForecasts } from "@repo/conditions/forecasts/testing";
import { apiUsage, developer, developerCalls, operator } from "@repo/db/schema/access";
import { user } from "@repo/db/schema/auth";
import { reading, station } from "@repo/db/schema/buoys";
import { spot, surfBreak } from "@repo/db/schema/spots";
import { createTestDatabase, TEST_DATABASE_URL } from "@repo/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Context } from "./context";
import { createMcp, listTools } from "./mcp";
import { procedureName } from "./procedures";
import { v1Router } from "./routers/index";
import { testPlaces, testVerification } from "./testing";
import { createUsage, type Usage } from "./usage";

const AT = new Date("2026-10-13T08:00:00Z");
const ADMIN = "https://admin.example.org";
const WEB = "https://app.example.org";
const ADDRESS = "https://api.example.org/mcp";
const BREAK = "0199d6f0-0000-7000-8000-000000000001";

// The tools an agent is given, and the procedure each one is. Each is named, so that a
// procedure becomes a tool only once someone adds it here on purpose: every one of them is a
// procedure a key may call, which `access.db.test.ts` lists.
const TOOLS: Record<string, string> = {
  get_forecast: "v1.forecasts.get",
  get_station: "v1.stations.get",
  get_station_readings: "v1.stations.readings",
  get_surf_break: "v1.breaks.get",
  get_surf_break_guide: "v1.guides.get",
  get_tide_extremes: "v1.tides.extremes",
  get_tide_timeline: "v1.tides.timeline",
  list_stations: "v1.stations.list",
  list_surf_breaks: "v1.breaks.list",
  search_surf_breaks: "v1.breaks.search",
};

// What an agent that an account signed in is given besides: what that account keeps, to read.
// None of them writes, and none is listed to a key. Decision 047.
const ACCOUNT_TOOLS: Record<string, string> = {
  get_my_session: "v1.sessions.get",
  get_my_sessions_recap: "v1.sessions.recap",
  get_my_surfer_profile: "v1.profile.get",
  list_my_alert_notifications: "v1.notifications.list",
  list_my_alerts: "v1.alerts.list",
  list_my_sessions: "v1.sessions.list",
  list_my_spots: "v1.spots.list",
};
const EVERY_TOOL = { ...TOOLS, ...ACCOUNT_TOOLS };
const sorted = (names: string[]) => names.toSorted((a, b) => a.localeCompare(b));

type Answer = Awaited<ReturnType<Client["callTool"]>>;

// What a tool answered, as the text an agent reads.
function textOf(answer: Answer) {
  const [first] = answer.content;
  if (first?.type !== "text") throw new Error("The tool answered no text");
  return first.text;
}
const read = <Body>(answer: Answer) => JSON.parse(textOf(answer)) as Body;

describe.skipIf(!TEST_DATABASE_URL)("the MCP server", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let usage: Usage;
  let mcp: ReturnType<typeof createMcp>;
  // No test asks the forecast provider: a function stands for it.
  const { forecasts } = testForecasts();
  const faults: unknown[] = [];

  const services = () => ({
    db: database.db,
    usage,
    forecasts,
    places: testPlaces().places,
    verification: testVerification(database.db, { on: false }).verification,
    adminSites: [ADMIN],
    server: { startedAt: AT, webOrigin: WEB },
  });

  beforeAll(async () => {
    database = await createTestDatabase();
    // Counted in memory, and written only when a test asks.
    usage = createUsage(database.db, { every: null });
    mcp = createMcp(services(), { onError: (error) => faults.push(error) });
  });
  afterAll(() => database?.drop());
  beforeEach(async () => {
    const { db } = database;
    faults.length = 0;
    await usage.flush();
    await db.delete(apiUsage);
    await db.delete(surfBreak);
    await db.delete(station);
    // Their keys and their counts go with the developer accounts.
    await db.delete(developer);
    await db.delete(user);
    await db.insert(user).values({ id: "owner", name: "Owner", email: "owner@example.org" });
    await db.insert(operator).values({ userId: "owner" });

    // Invented stations and breaks: nothing here was read from a provider.
    const stationOf = (id: string, longitude: number) => ({
      id,
      provider: "test",
      providerStationId: id,
      name: `Station ${id}`,
      latitude: 47.8,
      longitude,
      licenseType: "CC BY 4.0",
      licenseUrl: "https://example.org/licence",
      attribution: "Test network",
      reportsWaves: true,
    });
    await db.insert(station).values([
      { ...stationOf("buoy", -4.75), latestObservedAt: new Date("2026-10-13T07:30:00Z") },
      // Enough of them for a list to stop before the route would.
      ...Array.from({ length: 29 }, (_, index) => stationOf(`far-${index}`, 10 + index)),
    ]);
    await db.insert(reading).values({
      stationId: "buoy",
      observedAt: new Date("2026-10-13T07:30:00Z"),
      significantHeightM: 1.8,
      peakPeriodS: 13,
      peakDirectionDeg: 280,
    });
    await db.insert(surfBreak).values({
      id: BREAK,
      slug: BREAK,
      name: "Guéthary – Parlementia",
      latitude: 43.43,
      longitude: -1.61,
      provider: "test",
      attribution: "Test list",
      licenseType: "ODbL",
      licenseUrl: "https://example.org/odbl",
    });
  });

  function sessionOf(id: string): Session {
    const account = { id, name: id, email: `${id}@example.org`, emailVerified: false, image: null };
    const session = { id: `session-${id}`, userId: id, token: `token-${id}`, expiresAt: AT };
    const dates = { createdAt: AT, updatedAt: AT };
    return {
      user: { ...account, ...dates },
      session: { ...session, ...dates, ipAddress: null, userAgent: null },
    } as Session;
  }
  // The operator, from the admin's site: what makes a key.
  const asOperator = (): { context: Context } => ({
    context: {
      ...services(),
      session: sessionOf("owner"),
      authorization: null,
      site: ADMIN,
      reply: {},
    },
  });
  const makeKey = async (callsPerHour: number | null = null) => {
    const account = await call(
      v1Router.developers.create,
      { name: "an agent", callsPerHour },
      asOperator(),
    );
    const made = await call(
      v1Router.keys.create,
      { name: "its key", developerId: account.id },
      asOperator(),
    );
    return { ...made, developerId: account.id };
  };

  // One request to the server, as it arrives.
  const ask = (headers: Record<string, string>, method = "POST", server = mcp) =>
    server.fetch(
      new Request(ADDRESS, {
        method,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          ...headers,
        },
        ...(method === "POST"
          ? { body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) }
          : {}),
      }),
    );

  // An agent's client, speaking the protocol to the server with nothing in between: of
  // 2026-07-28, where each request stands alone, or of before, with its handshake.
  async function agent(key: string, mode: "auto" | "legacy" = "auto", server = mcp) {
    const client = new Client(
      { name: "a test agent", version: "1.0.0" },
      { versionNegotiation: { mode } },
    );
    await client.connect(
      new StreamableHTTPClientTransport(new URL(ADDRESS), {
        fetch: (input, init) => server.fetch(new Request(input, init)),
        requestInit: { headers: { Authorization: `Bearer ${key}` } },
      }),
    );
    return client;
  }

  const counted = async () => {
    await usage.flush();
    const rows = await database.db.select().from(apiUsage);
    return rows
      .map(({ via, way, keyId, procedure, outcome, calls }) => ({
        via,
        way,
        keyId,
        procedure,
        outcome,
        calls,
      }))
      .sort((a, b) =>
        `${a.procedure}${a.way}${a.outcome}`.localeCompare(`${b.procedure}${b.way}${b.outcome}`),
      );
  };

  describe("its tools", () => {
    it("are the procedures that declare one, and no other", async () => {
      const listed = await listTools();
      expect(
        Object.fromEntries(listed.map((tool) => [tool.name, procedureName(tool.procedure)])),
      ).toEqual(EVERY_TOOL);
      // What an account keeps is marked as such, and nothing else is.
      expect(sorted(listed.filter((tool) => tool.account).map((tool) => tool.name))).toEqual(
        Object.keys(ACCOUNT_TOOLS),
      );
    });

    it.each(["auto", "legacy"] as const)("are listed to an agent (%s)", async (mode) => {
      const { key } = await makeKey();
      const client = await agent(key, mode);
      const { tools } = await client.listTools();

      expect(tools.map((tool) => tool.name)).toEqual(Object.keys(TOOLS));
      for (const tool of tools) {
        expect(tool.title).toBeTruthy();
        // Written for a model: more than a route's summary.
        expect(tool.description?.length).toBeGreaterThan(120);
        expect(tool.inputSchema.type).toBe("object");
        // Every tool reads, and none writes.
        expect(tool.annotations).toMatchObject({ readOnlyHint: true });
      }
      expect(client.getInstructions()).toContain("metres");
    });

    it("say of an input what its route says, with the tool's own default", async () => {
      const { key } = await makeKey();
      const { tools } = await (await agent(key)).listTools();
      const schemaOf = (name: string) =>
        tools.find((tool) => tool.name === name)?.inputSchema as {
          required?: string[];
          properties: Record<string, Record<string, unknown>>;
        };

      const stations = schemaOf("list_stations");
      expect(stations.properties.bbox).toMatchObject({ type: "string" });
      expect(stations.properties.bbox?.description).toContain("west,south,east,north");
      expect(stations.properties.limit).toMatchObject({ maximum: 500, default: 25 });

      const tides = schemaOf("get_tide_extremes");
      expect(tides.required).toEqual(["latitude", "longitude", "start", "end"]);
      expect(tides.properties.start).toEqual({
        type: "string",
        format: "date-time",
        description: expect.stringContaining("UTC"),
      });
    });
  });

  describe("a call to a tool", () => {
    it.each(["auto", "legacy"] as const)(
      "answers what the route answers, with where it comes from (%s)",
      async (mode) => {
        const { key } = await makeKey();
        const client = await agent(key, mode);
        const answer = await client.callTool({ name: "get_station", arguments: { id: "buoy" } });

        expect(answer.isError).toBeFalsy();
        const byRoute = await call(
          v1Router.stations.get,
          { id: "buoy" },
          { context: { ...asOperator().context, session: null, authorization: `Bearer ${key}` } },
        );
        expect(read(answer)).toEqual(JSON.parse(JSON.stringify(byRoute)));
        expect(read(answer)).toMatchObject({
          attribution: "Test network",
          license: { type: "CC BY 4.0", url: "https://example.org/licence" },
          latestReading: { observedAt: "2026-10-13T07:30:00.000Z", significantHeightMeters: 1.8 },
        });
      },
    );

    it("asks for less than its route does, unless the agent says", async () => {
      const { key } = await makeKey();
      const client = await agent(key);

      const some = await client.callTool({ name: "list_stations", arguments: {} });
      expect(read<{ stations: unknown[] }>(some).stations).toHaveLength(25);
      const all = await client.callTool({ name: "list_stations", arguments: { limit: 100 } });
      expect(read<{ stations: unknown[] }>(all).stations).toHaveLength(30);
      const near = await client.callTool({
        name: "list_stations",
        arguments: { bbox: "-5.2,47.6,-4.0,48.5" },
      });
      expect(read<{ stations: { id: string }[] }>(near).stations.map(({ id }) => id)).toEqual([
        "buoy",
      ]);
    });

    it("finds a break, its forecast and its tides", async () => {
      const { key } = await makeKey();
      const client = await agent(key);

      const found = read<{ breaks: { id: string; latitude: number; longitude: number }[] }>(
        await client.callTool({ name: "search_surf_breaks", arguments: { q: "guethary" } }),
      );
      expect(found.breaks).toMatchObject([
        { id: BREAK, source: { attribution: "Test list", license: { type: "ODbL" } } },
      ]);
      const [{ latitude, longitude }] = found.breaks as [(typeof found.breaks)[number]];

      const forecast = read<{ hours: unknown[]; source: { attribution: string } }>(
        await client.callTool({
          name: "get_forecast",
          arguments: { latitude, longitude, days: 1 },
        }),
      );
      expect(forecast.hours).toHaveLength(24);
      expect(forecast.source.attribution).toBeTruthy();

      const tides = read<{ station: { license: { type: string } }; extremes: unknown[] }>(
        await client.callTool({
          name: "get_tide_extremes",
          arguments: {
            latitude,
            longitude,
            start: "2026-10-13T00:00:00Z",
            end: "2026-10-14T00:00:00Z",
          },
        }),
      );
      expect(tides.extremes.length).toBeGreaterThanOrEqual(3);
      expect(tides.station.license.type).toBeTruthy();
    });

    it("reads a break's guide, line by line", async () => {
      const { key } = await makeKey();
      const client = await agent(key);
      const guide = read<{ breakId: string; lines: { line: string; value: unknown }[] }>(
        await client.callTool({ name: "get_surf_break_guide", arguments: { breakId: BREAK } }),
      );
      expect(guide.breakId).toBe(BREAK);
      expect(guide.lines.map(({ line }) => line)).toEqual(
        expect.arrayContaining(["access", "entry", "hazards", "rules"]),
      );
    });

    it("is counted as a call to its procedure, under the key, and listing is not", async () => {
      const { key, id } = await makeKey();
      const client = await agent(key);
      await client.listTools();
      expect(await counted()).toEqual([]);

      await client.callTool({ name: "list_stations", arguments: {} });
      await client.callTool({ name: "list_stations", arguments: {} });
      await client.callTool({ name: "get_station", arguments: { id: "nowhere" } });

      expect(await counted()).toEqual([
        {
          via: "key",
          way: "mcp",
          keyId: id,
          procedure: "v1.stations.get",
          outcome: "invalid",
          calls: 1,
        },
        {
          via: "key",
          way: "mcp",
          keyId: id,
          procedure: "v1.stations.list",
          outcome: "answered",
          calls: 2,
        },
      ]);
      // Each of the three was let in against the hour of the key's developer account.
      const [hour] = await database.db.select().from(developerCalls);
      expect(hour?.calls).toBe(3);
    });

    it("is told from a call by the API's routes, by who made it and how many", async () => {
      const agents = await makeKey();
      const scripts = await makeKey();
      const client = await agent(agents.key);
      await client.callTool({ name: "list_stations", arguments: {} });
      await client.callTool({ name: "get_station", arguments: { id: "buoy" } });
      // The same procedure, called as a program calls a route, by each of the two keys.
      for (const { key } of [agents, scripts]) {
        await call(
          v1Router.stations.list,
          {},
          { context: { ...asOperator().context, session: null, authorization: `Bearer ${key}` } },
        );
      }

      expect(await counted()).toEqual([
        {
          via: "key",
          way: "mcp",
          keyId: agents.id,
          procedure: "v1.stations.get",
          outcome: "answered",
          calls: 1,
        },
        {
          via: "key",
          way: "api",
          keyId: agents.id,
          procedure: "v1.stations.list",
          outcome: "answered",
          calls: 1,
        },
        {
          via: "key",
          way: "api",
          keyId: scripts.id,
          procedure: "v1.stations.list",
          outcome: "answered",
          calls: 1,
        },
        {
          via: "key",
          way: "mcp",
          keyId: agents.id,
          procedure: "v1.stations.list",
          outcome: "answered",
          calls: 1,
        },
      ]);

      // What an operator reads of it: how much came each way, and whose agents called.
      const span = { from: new Date(Date.now() - 3_600_000), to: new Date(Date.now() + 3_600_000) };
      const byWay = await call(v1Router.usage.breakdown, { ...span, by: "way" }, asOperator());
      expect(byWay.rows.map(({ id, answered }) => ({ id, answered }))).toEqual([
        { id: "api", answered: 2 },
        { id: "mcp", answered: 2 },
      ]);
      const whose = await call(
        v1Router.usage.breakdown,
        { ...span, by: "developer", way: "mcp" },
        asOperator(),
      );
      expect(whose.rows.map(({ id, answered }) => ({ id, answered }))).toEqual([
        { id: agents.developerId, answered: 2 },
      ]);
      const series = await call(v1Router.usage.series, { ...span, way: "mcp" }, asOperator());
      expect(series.points.map(({ answered }) => answered)).toEqual([2]);
    });

    it("is held to the limit of the key's developer account, and told how long to wait", async () => {
      const { key, id } = await makeKey(2);
      const client = await agent(key);
      const list = () => client.callTool({ name: "list_stations", arguments: {} });

      expect((await list()).isError).toBeFalsy();
      // Listing the tools takes nothing of the hour.
      await client.listTools();
      expect((await list()).isError).toBeFalsy();
      const over = await list();
      expect(over.isError).toBe(true);
      expect(textOf(over)).toMatch(/^TOO_MANY_REQUESTS: .+ Ask again in \d+ seconds\.$/);

      expect(await counted()).toEqual([
        {
          via: "key",
          way: "mcp",
          keyId: id,
          procedure: "v1.stations.list",
          outcome: "answered",
          calls: 2,
        },
        {
          via: "key",
          way: "mcp",
          keyId: id,
          procedure: "v1.stations.list",
          outcome: "limited",
          calls: 1,
        },
      ]);
    });

    it("tells an agent what was wrong with what it asked", async () => {
      const { key } = await makeKey();
      const client = await agent(key);

      const wrong = await client.callTool({
        name: "get_forecast",
        arguments: { latitude: 120, longitude: -1.6 },
      });
      expect(wrong.isError).toBe(true);
      expect(textOf(wrong)).toMatch(/^BAD_REQUEST:.*\nlatitude: /);

      const none = await client.callTool({ name: "get_station", arguments: { id: "nowhere" } });
      expect(none.isError).toBe(true);
      expect(textOf(none)).toBe('NOT_FOUND: No station "nowhere".');
      // A refusal is the caller's, and nothing to tell the instance of.
      expect(faults).toEqual([]);
    });

    it("says nothing of a fault of the instance's, and tells the instance", async () => {
      const failing = createMcp(
        {
          ...services(),
          forecasts: {
            get: () => {
              throw new Error("what the database said");
            },
          } as never,
        },
        { onError: (error) => faults.push(error) },
      );
      const { key } = await makeKey();
      const client = await agent(key, "auto", failing);

      const answer = await client.callTool({
        name: "get_forecast",
        arguments: { latitude: 43.43, longitude: -1.61 },
      });
      expect(answer.isError).toBe(true);
      expect(textOf(answer)).toBe("The instance failed to answer. Try again later.");
      expect(faults).toHaveLength(1);
    });
  });

  describe("an agent that an account signed in", () => {
    // A token of the sign-in library stands for an account. Here a function says which: the
    // library itself is tried where it is set up, in the API's own tests.
    const TOKENS: Record<string, string> = { "token-of-ana": "ana", "token-of-ben": "ben" };
    const challenge =
      'Bearer resource_metadata="https://api.example.org/.well-known/oauth-protected-resource/mcp"';
    let signing: ReturnType<typeof createMcp>;
    const signedIn = (token: string) => {
      const client = new Client({ name: "a test agent", version: "1.0.0" });
      return client
        .connect(
          new StreamableHTTPClientTransport(new URL(ADDRESS), {
            fetch: (input, init) => signing.fetch(new Request(input, init)),
            requestInit: { headers: { Authorization: `Bearer ${token}` } },
          }),
        )
        .then(() => client);
    };

    beforeEach(async () => {
      signing = createMcp(services(), {
        accounts: {
          sessionOf: async (token) => (TOKENS[token] ? sessionOf(TOKENS[token]) : null),
          challenge,
        },
      });
      await database.db.insert(user).values([
        { id: "ana", name: "Ana", email: "ana@example.org" },
        { id: "ben", name: "Ben", email: "ben@example.org" },
      ]);
      await database.db.insert(spot).values([
        {
          id: "ana-home",
          userId: "ana",
          name: "Ana's reef",
          latitude: 43.6,
          longitude: -1.4,
          visibility: "private",
        },
        {
          id: "ben-home",
          userId: "ben",
          name: "Ben's bank",
          latitude: 47.8,
          longitude: -4.3,
          visibility: "private",
        },
      ]);
    });

    it("is listed what its account keeps besides what a key reads, and a key is not", async () => {
      const own = await signedIn("token-of-ana");
      const { tools } = await own.listTools();
      expect(tools.map((tool) => tool.name)).toEqual(sorted(Object.keys(EVERY_TOOL)));
      // None of them writes.
      for (const tool of tools) expect(tool.annotations).toMatchObject({ readOnlyHint: true });
      expect(own.getInstructions()).toContain("account that signed you in");

      const { key } = await makeKey();
      for (const server of [mcp, signing]) {
        const byKey = await (await agent(key, "auto", server)).listTools();
        expect(byKey.tools.map((tool) => tool.name)).toEqual(Object.keys(TOOLS));
      }
    });

    it("reads its own account, and nothing of another", async () => {
      const own = await signedIn("token-of-ana");
      const mine = read<{ spots: { id: string; name: string }[] }>(
        await own.callTool({ name: "list_my_spots", arguments: {} }),
      );
      expect(mine.spots.map(({ id }) => id)).toEqual(["ana-home"]);

      const alerts = await own.callTool({ name: "list_my_alerts", arguments: {} });
      expect(read(alerts)).toEqual({ alerts: [] });
      const log = await own.callTool({ name: "list_my_sessions", arguments: {} });
      expect(read(log)).toEqual({ sessions: [], next: null });
      // What everyone shares is read as before.
      const shared = await own.callTool({ name: "get_station", arguments: { id: "buoy" } });
      expect(read(shared)).toMatchObject({ id: "buoy" });
    });

    it("is counted with the accounts, as a call that came by MCP, and under no key", async () => {
      const own = await signedIn("token-of-ana");
      await own.callTool({ name: "list_my_spots", arguments: {} });
      await own.callTool({ name: "list_stations", arguments: {} });

      const none = { keyId: null, outcome: "answered", calls: 1 };
      expect(await counted()).toEqual([
        { via: "session", way: "mcp", procedure: "v1.spots.list", ...none },
        { via: "session", way: "mcp", procedure: "v1.stations.list", ...none },
      ]);
      // An account has no limit: nothing was added to an hour.
      expect(await database.db.select().from(developerCalls)).toEqual([]);
    });

    it("gives a key no tool of an account's", async () => {
      const { key } = await makeKey();
      const byKey = await agent(key, "auto", signing);
      const asked = await byKey
        .callTool({ name: "list_my_spots", arguments: {} })
        .then((answer) => (answer.isError ? "refused" : "answered"))
        .catch(() => "refused");
      expect(asked).toBe("refused");
      expect(await counted()).toEqual([]);
    });

    it("refuses a token that names no account, and says where an account signs in", async () => {
      const unknown = await ask({ Authorization: "Bearer a-token-nobody-made" }, "POST", signing);
      expect(unknown.status).toBe(401);
      expect(unknown.headers.get("WWW-Authenticate")).toBe(challenge);
      const none = await ask({}, "POST", signing);
      expect([none.status, none.headers.get("WWW-Authenticate")]).toEqual([401, challenge]);

      // A server that signs no agent in reads no token at all.
      const closed = await ask({ Authorization: "Bearer token-of-ana" });
      expect([closed.status, closed.headers.get("WWW-Authenticate")]).toEqual([401, "Bearer"]);
    });
  });

  describe("its door", () => {
    it("takes a working key at every request", async () => {
      const { key } = await makeKey();
      const answered = await ask({ Authorization: `Bearer ${key}` });
      expect(answered.status).toBe(200);
    });

    it.each([
      ["no key", {}],
      ["a key nobody made", { Authorization: `Bearer key_${"a".repeat(43)}` }],
      ["what is no key", { Authorization: "Bearer something-else" }],
      ["a cookie", { Cookie: "better-auth.session_token=token-owner" }],
      ["the web app's site", { Origin: WEB }],
    ])("refuses %s, and says what it takes", async (_, headers) => {
      const answered = await ask(headers);
      expect(answered.status).toBe(401);
      expect(answered.headers.get("WWW-Authenticate")).toBe("Bearer");
      expect(await answered.json()).toMatchObject({
        error: "invalid_token",
        error_description: expect.stringContaining("API key"),
      });
      // A request that is refused there reached no procedure: nothing is counted.
      expect(await counted()).toEqual([]);
    });

    it("refuses a key that was revoked, and one of a suspended developer account", async () => {
      const revoked = await makeKey();
      await call(v1Router.keys.revoke, { id: revoked.id }, asOperator());
      expect((await ask({ Authorization: `Bearer ${revoked.key}` })).status).toBe(401);

      const suspended = await makeKey();
      await call(
        v1Router.developers.update,
        { id: suspended.developerId, suspended: true },
        asOperator(),
      );
      expect((await ask({ Authorization: `Bearer ${suspended.key}` })).status).toBe(401);
      await expect(agent(suspended.key)).rejects.toThrow();
    });

    it("lets in a key that has made its calls for the hour, to be told so by a tool", async () => {
      const { key } = await makeKey(1);
      const client = await agent(key);
      await client.callTool({ name: "list_stations", arguments: {} });

      expect((await ask({ Authorization: `Bearer ${key}` })).status).toBe(200);
      const [hour] = await database.db.select().from(developerCalls);
      // The door added nothing to the hour.
      expect(hour?.calls).toBe(1);
    });

    it("keeps no session: it answers no request but a POST", async () => {
      const { key } = await makeKey();
      for (const method of ["GET", "DELETE"]) {
        const answered = await ask({ Authorization: `Bearer ${key}` }, method);
        expect(answered.status).toBe(405);
        expect(answered.headers.get("mcp-session-id")).toBeNull();
      }
    });

    it("gives a procedure the key and nothing else of the request", async () => {
      const seen = vi.spyOn(usage, "count");
      const { key } = await makeKey();
      // A cookie and the web app's site come with the key: neither names the caller.
      const client = new Client({ name: "a test agent", version: "1.0.0" });
      await client.connect(
        new StreamableHTTPClientTransport(new URL(ADDRESS), {
          fetch: (input, init) => mcp.fetch(new Request(input, init)),
          requestInit: {
            headers: {
              Authorization: `Bearer ${key}`,
              Cookie: "better-auth.session_token=token-owner",
              Origin: WEB,
            },
          },
        }),
      );
      await client.callTool({ name: "list_stations", arguments: {} });
      expect(seen).toHaveBeenCalledWith(
        expect.objectContaining({ via: "key", outcome: "answered" }),
      );
      seen.mockRestore();
    });
  });
});
