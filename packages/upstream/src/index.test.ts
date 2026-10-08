import http from "node:http";
import type { AddressInfo } from "node:net";

import { Effect, Fiber } from "effect";
import { afterEach, describe, expect, it } from "vitest";

import { fetchBytes, fetchJson, fetchText } from "./index";

type Handler = (request: http.IncomingMessage, response: http.ServerResponse) => void;

const servers: http.Server[] = [];
afterEach(() => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    server.close();
  }
});

// A provider on this machine, which counts the requests it gets and the answers it sees closed.
async function provider(handler: Handler) {
  const seen = { requests: 0, closed: 0, userAgent: "" };
  const server = http.createServer((request, response) => {
    seen.requests += 1;
    seen.userAgent = request.headers["user-agent"] ?? "";
    response.on("close", () => {
      seen.closed += 1;
    });
    handler(request, response);
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}/`, seen };
}

function until(condition: () => boolean, withinMs = 1000) {
  return new Promise<boolean>((resolve) => {
    const started = Date.now();
    const check = () => {
      if (condition()) resolve(true);
      else if (Date.now() - started > withinMs) resolve(false);
      else setTimeout(check, 10);
    };
    check();
  });
}

const failure = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(Effect.flip(effect));

describe("fetchText and fetchJson", () => {
  it("fetch a document and say who is asking", async () => {
    const { url, seen } = await provider((_, response) => response.end('{"height": 2.5}'));

    expect(await Effect.runPromise(fetchText(url))).toBe('{"height": 2.5}');
    expect(await Effect.runPromise(fetchJson(url))).toEqual({ height: 2.5 });
    expect(seen.userAgent).toMatch(/^[a-z]+\/\d/);
  });

  it("report an answer that is not JSON, without asking again", async () => {
    const { url, seen } = await provider((_, response) => response.end("<html></html>"));

    expect(await failure(fetchJson(url))).toMatchObject({
      _tag: "UpstreamError",
      retryable: false,
    });
    expect(seen.requests).toBe(1);
  });

  it("ask again after a failure of the provider", async () => {
    const { url, seen } = await provider((_, response) => {
      response.statusCode = seen.requests === 1 ? 503 : 200;
      response.end("ok");
    });

    expect(await Effect.runPromise(fetchText(url))).toBe("ok");
    expect(seen.requests).toBe(2);
  });

  it("do not ask again for a document that is not there, and do not leave its page open", async () => {
    const { url, seen } = await provider((_, response) => {
      response.statusCode = 404;
      // An error page that never ends.
      response.write("Not found");
    });

    expect(await failure(fetchText(url))).toMatchObject({ status: 404, retryable: false });
    expect(seen.requests).toBe(1);
    expect(await until(() => seen.closed === 1)).toBe(true);
  });
});

describe("fetchBytes", () => {
  it("returns a file up to the size it was given", async () => {
    const { url } = await provider((_, response) => response.end(Buffer.from([1, 2, 3, 4, 5])));

    expect(await Effect.runPromise(fetchBytes(url, 5))).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
  });

  it("refuses a file that announces a larger size, once", async () => {
    const { url, seen } = await provider((_, response) => response.end(Buffer.alloc(6)));

    expect(await failure(fetchBytes(url, 5))).toMatchObject({ retryable: false });
    expect(seen.requests).toBe(1);
  });

  it("stops a download that turns out larger than announced", async () => {
    const { url, seen } = await provider((_, response) => {
      // No size is announced, and the body never ends.
      response.write(Buffer.alloc(4));
      setTimeout(() => response.write(Buffer.alloc(4)), 20);
    });

    expect(await failure(fetchBytes(url, 5))).toMatchObject({ retryable: false });
    expect(seen.requests).toBe(1);
    expect(await until(() => seen.closed === 1)).toBe(true);
  });

  it("stops its download when the run is interrupted", async () => {
    const { url, seen } = await provider((_, response) => {
      response.write(Buffer.alloc(1));
    });

    const fiber = Effect.runFork(fetchBytes(url, 1000));
    expect(await until(() => seen.requests === 1)).toBe(true);
    await Effect.runPromise(Fiber.interrupt(fiber));

    expect(await until(() => seen.closed === 1)).toBe(true);
  });
});
