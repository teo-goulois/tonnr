import {
  type CallToolResult,
  createMcpHandler,
  fromJsonSchema,
  type JsonSchemaType,
  type JsonSchemaValidator,
  type jsonSchemaValidator,
  McpServer,
} from "@modelcontextprotocol/server";
import { call, isProcedure, ORPCError } from "@orpc/server";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import type { Session } from "@repo/auth";
import { APP_NAME, APP_SLUG } from "@repo/config/app";

import { clientAddressOf } from "./address";
import type { Context } from "./context";
import { keyWorks, readAuthorization } from "./keys";
import { v1Router } from "./routers/index";

/**
 * What a procedure says of itself as a tool of the MCP server: decision 045. A procedure that
 * declares one in its metadata is listed to an agent, under this name, and called by it.
 */
export type Tool = {
  // How an agent calls it.
  name: string;
  // A few words for a person who reads a client's list of tools.
  title: string;
  // What it gives, in which units, within which bounds, and what to call next: for a model.
  description: string;
  // What the tool asks for when an agent leaves it out, where the route's own default suits a
  // program and would fill a model's context.
  defaults?: Record<string, number>;
  // A tool that reads what an account keeps. It is listed to an agent that an account signed
  // in, and to no key: decision 047.
  account?: true;
};

/**
 * What signs an agent in as an account. The program that holds the sign-in library gives it:
 * nothing here knows how a token is made or read.
 */
export type Accounts = {
  // The account an access token stands for, as a session of it. Null when the token is none
  // of the instance's, has ended, or names an account that may not sign in.
  sessionOf: (token: string) => Promise<Session | null>;
  // What a refusal says in `WWW-Authenticate`, so that a client finds where an account signs in.
  challenge: string;
};

// What the server is given once, and every call reads: all of a procedure's context but what
// names the caller.
type Services = Pick<
  Context,
  "db" | "usage" | "forecasts" | "places" | "verification" | "server" | "adminSites"
>;

type Options = {
  // What is told of a fault of the instance's. The agent is told nothing of it.
  onError?: (error: unknown) => void;
  now?: () => Date;
  // Without it, the server takes a key and nothing else.
  accounts?: Accounts;
};

type Listed = Tool & { procedure: never; inputSchema: JsonSchemaType };

const HOUR_SECONDS = 60 * 60;

// What every tool is: it reads what the instance holds, and writes nothing.
const READS = { readOnlyHint: true, openWorldHint: false };

// Said once to the model, before any tool.
const INSTRUCTIONS =
  `${APP_NAME} serves surf conditions: what buoys and wind stations measure, hourly forecasts ` +
  "of waves and wind at a point, tides, and a catalogue of surf breaks. Every tool reads, and " +
  "none changes anything. Heights are in metres, periods in seconds, speeds in metres per " +
  "second, and directions in degrees clockwise from north that the sea or the wind comes from: " +
  "270 is a swell or a wind from the west. Times are ISO 8601 in UTC. A field that is null " +
  "was not measured or is not known. For a surf spot, find it with search_surf_breaks, then " +
  "ask get_forecast and get_tide_extremes at its latitude and longitude, and list_stations " +
  "around it for what the sea does now. An answer names where its data comes from, in " +
  "`attribution`, `source` and `license`: say it when you give the data to someone.";
// Said as well to an agent that an account signed in.
const ACCOUNT_INSTRUCTIONS =
  " You act for an account that signed you in: the tools whose name holds `my` read what that " +
  "account keeps, its spots, its alerts, what they told and its log of sessions. They change " +
  "nothing. A spot of the account's is private: do not give its name or its place to anyone " +
  "but the person you act for.";

// The procedure checks what an agent sends, as it does on the API's other transports, and
// refuses in its own words. The tool's schema is what is said of the input, not a second judge.
const unchecked: jsonSchemaValidator = {
  getValidator:
    <T>(): JsonSchemaValidator<T> =>
    (input) => ({ valid: true, data: input as T, errorMessage: undefined }),
};

// What a converter adds for a program that generates a client, and a model does not read.
function plain(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(plain);
  if (typeof schema !== "object" || schema === null) return schema;
  return Object.fromEntries(
    Object.entries(schema)
      .filter(([key]) => !key.startsWith("x-"))
      .map(([key, value]) => [key, plain(value)]),
  );
}

/**
 * The tools of a router: every procedure that declares one, with the schema of its own input
 * as the reference of the API gives it.
 */
export async function toolsOf(router: object): Promise<Listed[]> {
  const converter = new ZodToJsonSchemaConverter();
  const found: Listed[] = [];
  for (const value of Object.values(router)) {
    if (!isProcedure(value)) {
      if (typeof value === "object" && value !== null) found.push(...(await toolsOf(value)));
      continue;
    }
    const { meta, inputSchema } = value["~orpc"];
    const tool = (meta as { mcp?: Tool }).mcp;
    if (!tool) continue;

    // A procedure that takes nothing is a tool that takes an empty object.
    const converted = inputSchema
      ? (await converter.convert(inputSchema, { strategy: "input" }))[1]
      : { type: "object", properties: {} };
    const schema = plain(converted) as { properties?: Record<string, { default?: unknown }> };
    // The tool says the default it asks with, not the route's.
    for (const [name, value] of Object.entries(tool.defaults ?? {})) {
      const property = schema.properties?.[name];
      if (!property) throw new Error(`The tool ${tool.name} gives a default to no input: ${name}`);
      property.default = value;
    }
    found.push({ ...tool, procedure: value as never, inputSchema: schema as JsonSchemaType });
  }
  return found;
}

// Converted once: the router does not change while the program runs.
const tools = toolsOf(v1Router).then((found) => {
  const names = found.map((tool) => tool.name);
  const twice = names.find((name, index) => names.indexOf(name) !== index);
  if (twice) throw new Error(`Two procedures declare the tool ${twice}`);
  return found.sort((a, b) => a.name.localeCompare(b.name));
});

/** The tools the MCP server lists, by name. */
export const listTools = () => tools;

// What an agent is told of a call that gave no answer: the procedure's own refusal, which is
// written for its caller, and what an agent can do about it. A fault of the instance's says
// nothing of itself.
function refusalOf(error: unknown, reply: Context["reply"], now: Date) {
  if (!(error instanceof ORPCError)) return "The instance failed to answer. Try again later.";

  const said = error.message && error.message !== error.code ? ` ${error.message}` : "";
  // Of a key alone: an account's sign-in is read at the door, and a procedure is given the account.
  if (error.code === "UNAUTHORIZED") {
    return "UNAUTHORIZED: this API key no longer works. An operator of the instance makes one.";
  }
  if (error.code === "TOO_MANY_REQUESTS" || error.status === 503) {
    const left =
      reply.retryAfterSeconds ??
      (error.code === "TOO_MANY_REQUESTS"
        ? HOUR_SECONDS - (Math.floor(now.getTime() / 1000) % HOUR_SECONDS)
        : undefined);
    return `${error.code}:${said}${left === undefined ? "" : ` Ask again in ${left} seconds.`}`;
  }
  // What was wrong with the input, one line for each fault, so that the agent asks again right.
  const issues = (error.data as { issues?: { path?: PropertyKey[]; message?: string }[] } | null)
    ?.issues;
  if (error.code === "BAD_REQUEST" && Array.isArray(issues)) {
    const lines = issues.map(
      (issue) => `${(issue.path ?? []).map(String).join(".") || "input"}: ${issue.message ?? ""}`,
    );
    return `BAD_REQUEST:${said}\n${lines.join("\n")}`;
  }
  return error.status < 500 ? `${error.code}:${said}` : "The instance failed to answer.";
}

// A request that names no working key and no account is told what the server takes, and where
// an account signs in when the instance signs agents in.
function refused(accounts: Accounts | undefined) {
  const message = accounts
    ? "This server takes the sign-in of an account, or an API key of the instance, in " +
      "Authorization: Bearer."
    : "This server takes an API key of the instance, in Authorization: Bearer. An operator of " +
      "the instance makes one.";
  return new Response(JSON.stringify({ error: "invalid_token", error_description: message }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "WWW-Authenticate": accounts?.challenge ?? "Bearer",
    },
  });
}

/**
 * The MCP server of an instance, as what answers one HTTP request: an agent lists the tools
 * and calls them over Streamable HTTP, and nothing is kept between two requests.
 *
 * It takes a request that names a working API key, or an account that signed the agent in,
 * and no other: no cookie, no visitor of the web app, no link of a shared list. A tool is a
 * procedure of the API, called as the key's program or the account itself would call it: the
 * procedure asks who calls, holds a key to its developer account's limit, counts the call
 * under its own name, and checks the input. Nothing here reads the database but the door.
 * Decisions 045 and 047.
 */
export function createMcp(
  services: Services,
  { onError, now = () => new Date(), accounts }: Options = {},
) {
  // A request that the protocol refuses is answered and not logged: it holds what its caller
  // sent. Only a fault of a tool's is told, below.
  const handler = createMcpHandler(async ({ requestInfo, authInfo }) => {
    // The account that signed the agent in, as the door found it. Null for a key.
    const session = (authInfo?.extra?.session as Session | undefined) ?? null;
    // A procedure is given the key, or the account, and nothing else that names a caller: a
    // cookie that came with the request is not read, nor is the site it says it comes from.
    const context = (): Context => ({
      ...services,
      session,
      site: null,
      address: requestInfo ? clientAddressOf(requestInfo.headers, null) : null,
      authorization: session ? null : (requestInfo?.headers.get("authorization") ?? null),
      // The call is counted as its procedure's, and as one that came this way.
      way: "mcp",
      reply: {},
    });

    const server = new McpServer(
      { name: APP_SLUG, title: APP_NAME, version: "1.0.0" },
      { instructions: session ? INSTRUCTIONS + ACCOUNT_INSTRUCTIONS : INSTRUCTIONS },
    );
    for (const tool of await tools) {
      // What an account keeps is listed to that account's agent, and to no key.
      if (tool.account && !session) continue;
      server.registerTool(
        tool.name,
        {
          title: tool.title,
          description: tool.description,
          inputSchema: fromJsonSchema<Record<string, unknown>>(tool.inputSchema, unchecked),
          annotations: READS,
        },
        async (asked): Promise<CallToolResult> => {
          const called = context();
          try {
            const input = { ...tool.defaults, ...asked };
            const answer = await call(tool.procedure, input as never, { context: called });
            return { content: [{ type: "text", text: JSON.stringify(answer) }] };
          } catch (error) {
            if (!(error instanceof ORPCError) || error.status >= 500) onError?.(error);
            const text = refusalOf(error, called.reply, now());
            return { isError: true, content: [{ type: "text", text }] };
          }
        },
      );
    }
    return server;
  });

  return {
    /** Answers one request to the server's address. */
    async fetch(request: Request) {
      const header = request.headers.get("authorization");
      const named = readAuthorization(header);
      // Asked at every request, the ones that only list the tools too. It counts nothing: a
      // call is counted, and a key held to its limit, by the procedure it runs.
      if (named !== null && named !== "refused" && named.via === "key") {
        return (await keyWorks(services.db, named.key))
          ? handler.fetch(request)
          : refused(accounts);
      }

      // What is no key and no link of a list may be the token of an account's sign-in.
      const token = named === "refused" ? /^bearer ([^ ]+)$/i.exec(header ?? "")?.[1] : undefined;
      const session = token && accounts ? await accounts.sessionOf(token) : null;
      if (!session) return refused(accounts);
      // The token itself goes no further than the door: a tool is given the account.
      const authInfo = { token: "", clientId: "", scopes: [], extra: { session } };
      return handler.fetch(request, { authInfo });
    },
  };
}
