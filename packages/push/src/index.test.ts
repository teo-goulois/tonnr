import http from "node:http";
import net from "node:net";

import { afterEach, describe, expect, it, vi } from "vitest";

import { PUSH_BYTES } from "./encrypt";
import { createPusher } from "./index";
import { makeVapidKeys } from "./keys";
import { post } from "./request";
import { readVapid, testPusher, testReceiver } from "./testing";

const push = {
  title: "The bay: it is on",
  body: "Home: Sat 10 Oct, 08:00 to 12:00",
  url: "https://app.example.org/app?spot=home",
  tag: "a-tag",
};
const made = makeVapidKeys();
const settings = { VAPID_PUBLIC_KEY: made.publicKey, VAPID_PRIVATE_KEY: made.privateKey };
const SUBJECT = "https://app.example.org";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("the pusher of an instance", () => {
  it("is none when the settings hold no keys", () => {
    expect(createPusher({}, SUBJECT)).toBeNull();
    expect(createPusher({ VAPID_PUBLIC_KEY: "", VAPID_PRIVATE_KEY: "" }, SUBJECT)).toBeNull();
  });

  it("is not made of settings that cannot be right", () => {
    const other = makeVapidKeys();

    expect(() => createPusher({ VAPID_PUBLIC_KEY: made.publicKey }, SUBJECT)).toThrow("or neither");
    expect(() => createPusher({ VAPID_PRIVATE_KEY: made.privateKey }, SUBJECT)).toThrow(
      "or neither",
    );
    expect(() => createPusher({ ...settings, VAPID_PUBLIC_KEY: other.publicKey }, SUBJECT)).toThrow(
      "not the public key of VAPID_PRIVATE_KEY",
    );
    expect(() => createPusher(settings, "the web app")).toThrow("by an address");
  });

  it("is none without an address that names the instance, once its keys are known to be a pair", () => {
    const other = makeVapidKeys();

    expect(createPusher(settings, undefined)).toBeNull();
    expect(() =>
      createPusher({ ...settings, VAPID_PUBLIC_KEY: other.publicKey }, undefined),
    ).toThrow("not the public key of VAPID_PRIVATE_KEY");
    expect(() => createPusher({ VAPID_PUBLIC_KEY: made.publicKey }, undefined)).toThrow(
      "or neither",
    );
  });

  it("asks nothing of anyone when it is made", () => {
    const asked = vi.fn(() => Promise.reject(new Error("no network in a test")));
    vi.stubGlobal("fetch", asked);
    const requested = vi.spyOn(http, "request");

    createPusher(settings, SUBJECT);

    expect(asked).not.toHaveBeenCalled();
    expect(requested).not.toHaveBeenCalled();
  });

  it("sends what a push says to one browser, encrypted for it and signed for its push service", async () => {
    const service = testPusher();
    const device = service.device("https://updates.push.services.mozilla.com/wpush/v2/invented");

    expect(await service.pusher.send(device, push, 3600)).toBe("taken");

    expect(service.sent()).toEqual([{ endpoint: device.endpoint, keepSeconds: 3600, push }]);
    const [asked] = service.asked();
    expect(asked?.headers).toMatchObject({
      "content-encoding": "aes128gcm",
      "content-type": "application/octet-stream",
      ttl: "3600",
    });
    expect(readVapid(asked?.headers.authorization)).toMatchObject({
      publicKey: service.publicKey,
      claims: {
        aud: "https://updates.push.services.mozilla.com",
        sub: "https://app.example.org",
      },
      isSigned: true,
    });
    // The push service reads the address, and nothing of the alert.
    expect(Buffer.from(asked?.body ?? []).toString("latin1")).not.toContain("Home");
  });

  it("says only what a push holds: a title, a body, a page and a tag", async () => {
    const service = testPusher();
    const device = service.device();

    await service.pusher.send(device, { ...push, account: "owner" } as typeof push, 60);

    expect(service.sent()[0]?.push).toEqual(push);
  });

  it("tells the push service how long to keep a push, in whole seconds it takes", async () => {
    const service = testPusher();
    const device = service.device();

    for (const seconds of [90.9, 0, -5, 365 * 24 * 60 * 60]) {
      await service.pusher.send(device, push, seconds);
    }

    expect(service.sent().map((sent) => sent.keepSeconds)).toEqual([90, 0, 0, 28 * 24 * 60 * 60]);
  });

  it("sends nothing when it is not told a number of seconds to keep a push for", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const service = testPusher();
    const device = service.device();

    for (const seconds of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(await service.pusher.send(device, push, seconds)).toBe("refused");
    }

    // What a push service takes is a number: nothing else is put on the wire.
    expect(service.asked()).toEqual([]);
    expect(logged.mock.calls.flat().join(" ")).toContain("no time to keep it for");
  });

  it("signs once an hour for each push service, and not once for each push", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-12T08:00:00Z"));
    const service = testPusher();
    const chrome = service.device("https://fcm.googleapis.com/fcm/send/invented-one");
    const other = service.device("https://fcm.googleapis.com/fcm/send/invented-two");
    const safari = service.device("https://web.push.apple.com/invented-three");
    const signed = () => service.asked().map((asked) => asked.headers.authorization);

    await service.pusher.send(chrome, push, 60);
    vi.setSystemTime(new Date("2026-10-12T08:59:59Z"));
    await service.pusher.send(other, push, 60);
    await service.pusher.send(safari, push, 60);
    // Two browsers of one push service: the same token. Another push service: another.
    expect(signed()[1]).toBe(signed()[0]);
    expect(readVapid(signed()[2])?.claims.aud).toBe("https://web.push.apple.com");

    // An hour after it was signed, another is: it is good for half a day from then.
    vi.setSystemTime(new Date("2026-10-12T09:00:00Z"));
    await service.pusher.send(chrome, push, 60);
    expect(signed()[3]).not.toBe(signed()[0]);
    expect(readVapid(signed()[3])).toMatchObject({
      claims: { exp: Date.parse("2026-10-12T21:00:00Z") / 1000 },
      isSigned: true,
    });
    // A clock that was set back does not keep a token for longer than it is good for.
    vi.setSystemTime(new Date("2026-10-11T09:00:00Z"));
    await service.pusher.send(chrome, push, 60);
    expect(readVapid(signed()[4])?.claims.exp).toBe(Date.parse("2026-10-11T21:00:00Z") / 1000);
    vi.useRealTimers();
  });

  it("says what became of a push, by what the push service answered", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const service = testPusher();
    const device = service.device();
    const outcomes: Record<string, number[]> = {};

    for (const status of [200, 201, 202, 404, 410, 301, 307, 400, 401, 403, 413, 429, 500, 503]) {
      service.answers.set(device.endpoint, status);
      (outcomes[await service.pusher.send(device, push, 60)] ??= []).push(status);
    }
    service.answers.set(device.endpoint, async () => ({ failure: "ECONNREFUSED" }));
    (outcomes[await service.pusher.send(device, push, 60)] ??= []).push(0);

    expect(outcomes).toEqual({
      taken: [200, 201, 202],
      // The two answers that say a subscription is no more.
      gone: [404, 410],
      // An answer that says no: the push did not leave.
      refused: [301, 307, 400, 401, 403, 413, 429],
      // No answer, or one that says the push service failed: it may have taken it.
      failed: [500, 503, 0],
    });
  });

  it("sends only to an address that a push service of the browsers gave", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const service = testPusher();

    for (const endpoint of [
      "https://push.example.org/invented",
      "http://fcm.googleapis.com/fcm/send/invented",
      "https://127.0.0.1/invented",
      "not an address",
    ]) {
      expect(await service.pusher.send(service.device(endpoint), push, 60)).toBe("refused");
    }

    expect(service.asked()).toEqual([]);
    expect(logged.mock.calls.flat().join(" ")).not.toContain("invented");
  });

  it("sends nothing that one push cannot hold, or that the browser's keys cannot read", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const service = testPusher();
    const device = service.device();

    expect(await service.pusher.send(device, { ...push, body: "a".repeat(PUSH_BYTES) }, 60)).toBe(
      "refused",
    );
    expect(await service.pusher.send({ ...device, auth: "short" }, push, 60)).toBe("refused");

    expect(service.asked()).toEqual([]);
    expect(logged.mock.calls.flat().join(" ")).toContain("too long for one push");
  });

  it("logs how a push failed, and nothing of the address or of what it said", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const service = testPusher();
    const device = service.device("https://fcm.googleapis.com/fcm/send/a-capability");

    service.answers.set(device.endpoint, 403);
    await service.pusher.send(device, push, 60);
    service.answers.set(device.endpoint, async () => ({ failure: "ETIMEDOUT" }));
    await service.pusher.send(device, push, 60);
    service.answers.set(device.endpoint, () =>
      Promise.reject(new Error(`could not reach ${device.endpoint}`)),
    );
    expect(await service.pusher.send(device, push, 60)).toBe("failed");
    // A subscription that is gone is how a subscription ends: nothing failed.
    service.answers.set(device.endpoint, 410);
    await service.pusher.send(device, push, 60);

    expect(logged.mock.calls.map((call) => call.join(" "))).toEqual([
      "push: not taken (status 403)",
      "push: not taken (ETIMEDOUT)",
      "push: not taken (Error)",
    ]);
  });
});

describe("a push to a server of this machine that stands for a push service", () => {
  // A server that answers as told, or that takes a connection and says nothing at all. Each
  // connection it was given is counted when it ends.
  async function serving(answer?: (request: http.IncomingMessage) => number) {
    const asked: { path: string; headers: http.IncomingHttpHeaders; body: Uint8Array }[] = [];
    let ended = 0;
    const counted = (socket: net.Socket) => {
      socket.on("error", () => {});
      socket.on("close", () => {
        ended += 1;
      });
    };
    const server = answer
      ? http.createServer((request, response) => {
          const chunks: Uint8Array[] = [];
          request.on("data", (chunk: Uint8Array) => chunks.push(chunk));
          request.on("end", () => {
            const body = Buffer.concat(chunks);
            asked.push({ path: request.url ?? "", headers: request.headers, body });
            const status = answer(request);
            // A connection that the server would keep for the next request, and a body that
            // never ends: neither holds the one who asked.
            response.writeHead(status, {
              connection: "keep-alive",
              ...(status === 307 ? { location: `${request.headers["x-elsewhere"]}` } : {}),
            });
            response.write("the push service goes on speaking");
          });
        })
      : // What is sent to a server that says nothing is read all the same, or it would not see
        // the connection end.
        net.createServer((socket) => void socket.resume());
    server.on("connection", counted);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as net.AddressInfo;
    return {
      port,
      asked,
      ended: () => ended,
      close: () =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        }),
    };
  }
  // A test names its own server: nothing else is at an address of this machine.
  const local = (port: number, more: { sendMs?: number } = {}) =>
    createPusher(settings, SUBJECT, {
      allows: (address) => address.startsWith(`http://127.0.0.1:${port}/`),
      ...more,
    });

  it("leaves once, as a browser's push service takes it, and is read by the browser", async () => {
    const server = await serving(() => 201);
    const browser = testReceiver();
    const device = { endpoint: `http://127.0.0.1:${server.port}/push/invented`, ...browser.keys };

    expect(await local(server.port)?.send(device, push, 7200)).toBe("taken");

    expect(server.asked).toHaveLength(1);
    const [asked] = server.asked;
    expect(asked?.path).toBe("/push/invented");
    expect(asked?.headers).toMatchObject({
      ttl: "7200",
      "content-encoding": "aes128gcm",
      "content-length": String(asked?.body.length),
    });
    expect(readVapid(asked?.headers.authorization)).toMatchObject({
      publicKey: made.publicKey,
      claims: { aud: `http://127.0.0.1:${server.port}`, sub: SUBJECT },
      isSigned: true,
    });
    expect(JSON.parse(browser.open(asked?.body ?? Buffer.alloc(0)))).toEqual(push);
    // Answered, it keeps no connection for later, whatever the server offers.
    await vi.waitFor(() => expect(server.ended()).toBe(1));
    await server.close();
  });

  it("follows no redirection: nothing is sent where the answer points", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const elsewhere = await serving(() => 201);
    const server = await serving(() => 307);
    const browser = testReceiver();
    const pusher = createPusher(settings, SUBJECT, {
      allows: () => true,
      post: (address, headers, body, signal) =>
        post(
          address,
          { ...headers, "x-elsewhere": `http://127.0.0.1:${elsewhere.port}/push/other` },
          body,
          signal,
        ),
    });

    expect(
      await pusher?.send(
        { endpoint: `http://127.0.0.1:${server.port}/push/invented`, ...browser.keys },
        push,
        60,
      ),
    ).toBe("refused");

    expect(server.asked).toHaveLength(1);
    await vi.waitFor(() => expect(server.ended()).toBe(1));
    expect(elsewhere.asked).toEqual([]);
    expect(elsewhere.ended()).toBe(0);
    await server.close();
    await elsewhere.close();
  });

  it("closes its connection when it is given up, so that nothing leaves after the answer", async () => {
    const server = await serving();
    const giveUp = AbortSignal.timeout(100);

    const answer = await post(
      new URL(`http://127.0.0.1:${server.port}/push/invented`),
      { ttl: "60" },
      Buffer.from("a body"),
      giveUp,
    );

    expect(answer).toEqual({ failure: "given up" });
    // The server that never answered sees the connection go.
    await vi.waitFor(() => expect(server.ended()).toBe(1));
    await server.close();
  });

  it("opens no connection for a push that was given up before it left", async () => {
    const server = await serving();

    const answer = await post(
      new URL(`http://127.0.0.1:${server.port}/push/invented`),
      { ttl: "60" },
      Buffer.from("a body"),
      AbortSignal.abort(),
    );

    expect(answer).toEqual({ failure: "given up" });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(server.ended()).toBe(0);
    await server.close();
  });

  it("answers `failed` in the time a push is given, through the pusher, and closes its connection", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const server = await serving();
    const browser = testReceiver();
    const started = Date.now();

    expect(
      await local(server.port, { sendMs: 100 })?.send(
        { endpoint: `http://127.0.0.1:${server.port}/push/invented`, ...browser.keys },
        push,
        60,
      ),
    ).toBe("failed");

    expect(Date.now() - started).toBeLessThan(1500);
    await vi.waitFor(() => expect(server.ended()).toBe(1));
    expect(logged.mock.calls.flat().join(" ")).toBe("push: not taken (no answer in time)");
    await server.close();
  });

  it("gives up a server that takes the connection and never speaks TLS, and closes it", async () => {
    // What a push service's address is in fact: `https`, to a server that says nothing.
    const server = await serving();
    const started = Date.now();

    const answer = await post(
      new URL(`https://127.0.0.1:${server.port}/push/invented`),
      { ttl: "60" },
      Buffer.from("a body"),
      AbortSignal.timeout(100),
    );

    expect(answer).toEqual({ failure: "given up" });
    expect(Date.now() - started).toBeLessThan(1500);
    await vi.waitFor(() => expect(server.ended()).toBe(1));
    await server.close();
  });

  it("says how it failed when no server is there, by the kind the system names", async () => {
    const server = await serving();
    const { port } = server;
    await server.close();

    const answer = await post(
      new URL(`http://127.0.0.1:${port}/push/invented`),
      { ttl: "60" },
      Buffer.from("a body"),
      AbortSignal.timeout(2000),
    );

    expect(answer).toEqual({ failure: "ECONNREFUSED" });
  });
});
