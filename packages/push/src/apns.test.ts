import { generateKeyPairSync } from "node:crypto";
import http2 from "node:http2";
import net from "node:net";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createApnsPusher } from "./apns";
import { STAND_IN } from "./apps";
import type { Push } from "./index";
import { readToken, testApns, testReceiver } from "./testing";

// The pushes to the app on an iPhone: decision 072. No test asks Apple: `testApns` stands for
// it, and a server of this machine for its HTTP/2.

const push: Push = {
  title: "The bay: it is on",
  body: "Home: Sat 10 Oct, 08:00 to 12:00",
  url: "https://app.example.org/app?spot=home",
  tag: "a-tag",
  locale: "fr",
  thread: "alert:the-alert",
  category: "begins",
  ids: { notification: "the-notification", alert: "the-alert" },
  level: "time-sensitive",
  badge: 3,
};
// What the app reads of it: all but the language of the line that stands in for it.
const { locale: _locale, ...read } = push;

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("the pusher of an instance to its iOS app", () => {
  const { settings } = testApns();

  it("is none when the settings hold none of the three APNS_ variables", () => {
    expect(createApnsPusher({})).toBeNull();
    // The team alone is Sign in with Apple's too: it pushes nothing by itself.
    expect(createApnsPusher({ APPLE_TEAM_ID: settings.APPLE_TEAM_ID })).toBeNull();
  });

  // Keys of other kinds, made as the tests are gathered: an RSA pair takes a while to make.
  const rsa = generateKeyPairSync("rsa", { modulusLength: 1024 })
    .privateKey.export({ format: "pem", type: "pkcs8" })
    .toString();
  const otherCurve = generateKeyPairSync("ec", { namedCurve: "P-384" })
    .privateKey.export({ format: "pem", type: "pkcs8" })
    .toString();

  it("is not made of settings that cannot be right, and names what is missing and nothing of the key", () => {
    const { APPLE_TEAM_ID: _team, ...noTeam } = settings;
    const { APNS_TOPIC: _topic, ...noTopic } = settings;

    const said = (wrong: Parameters<typeof createApnsPusher>[0]) => {
      try {
        createApnsPusher(wrong);
      } catch (error) {
        return String(error);
      }
      return "made";
    };
    expect(said(noTeam)).toContain("Set APPLE_TEAM_ID to push to the iOS app");
    expect(said(noTopic)).toContain("Set APNS_TOPIC");
    expect(said({ APNS_KEY_ID: settings.APNS_KEY_ID })).toContain(
      "Set APPLE_TEAM_ID and APNS_PRIVATE_KEY and APNS_TOPIC",
    );
    expect(said({ ...settings, APNS_PRIVATE_KEY: "not a key" })).toContain(
      "APNS_PRIVATE_KEY is not a private key in PEM",
    );
    expect(said({ ...settings, APNS_PRIVATE_KEY: rsa })).toContain("is not an EC private key");
    expect(said({ ...settings, APNS_PRIVATE_KEY: otherCurve })).toContain("curve P-256");
    for (const key of [settings.APNS_PRIVATE_KEY, rsa]) {
      expect(said({ ...settings, APNS_PRIVATE_KEY: key.slice(0, 60) })).not.toContain(
        key.slice(30, 60),
      );
    }
  });

  it("takes the key with its line breaks written as `\\n`", () => {
    expect(
      createApnsPusher({
        ...settings,
        APNS_PRIVATE_KEY: settings.APNS_PRIVATE_KEY.replaceAll("\n", "\\n"),
      }),
    ).not.toBeNull();
  });

  it("asks nothing of anyone when it is made", () => {
    const connect = vi.spyOn(http2, "connect");

    createApnsPusher(settings);

    expect(connect).not.toHaveBeenCalled();
  });
});

describe("a push to an iPhone", () => {
  it("is an alert that the app's extension opens, encrypted for the phone, which Apple shows a plain line for", async () => {
    const apple = testApns();
    const phone = apple.device();

    expect(await apple.pusher.send(phone, push, 3600)).toBe("taken");

    const [sent] = apple.sent();
    expect(sent).toMatchObject({
      host: "https://api.push.apple.com",
      token: phone.token,
      // The line the web app's service worker shows for a push it cannot read, in the
      // account's language.
      standIn: STAND_IN.fr,
      mutable: 1,
      priority: 10,
      push: read,
    });
    const [asked] = apple.asked();
    expect(asked?.headers).toMatchObject({
      ":path": `/3/device/${phone.token}`,
      "apns-push-type": "alert",
      "apns-topic": "org.example.app",
    });
    // Apple reads nothing of the alert: the payload holds the stand-in line and what is sealed.
    expect(Object.keys(asked?.payload ?? {}).sort()).toEqual(["aps", "encrypted"]);
    expect(Object.keys(asked?.payload.aps ?? {}).sort()).toEqual(["alert", "mutable-content"]);
    const all = JSON.stringify(asked);
    for (const word of ["bay", "Home", "the-alert", "the-notification", "begins", "a-tag"]) {
      expect(all).not.toContain(word);
    }
  });

  it("speaks English in the line that stands in for it when the push names no language", async () => {
    const apple = testApns();

    await apple.pusher.send(apple.device(), { ...push, locale: undefined }, 60);

    expect(apple.sent()[0]?.standIn).toBe(STAND_IN.en);
  });

  it("goes to Apple's sandbox for a phone whose build is a development one", async () => {
    const apple = testApns();

    await apple.pusher.send(apple.device("development"), push, 60);

    expect(apple.sent()[0]?.host).toBe("https://api.sandbox.push.apple.com");
  });

  it("is urgent but for the evening before, which Apple may hold back", async () => {
    const apple = testApns();
    const phone = apple.device();

    for (const level of ["passive", "active", "time-sensitive", undefined] as const) {
      await apple.pusher.send(phone, { ...push, level }, 60);
    }

    expect(apple.sent().map((sent) => sent.priority)).toEqual([5, 10, 10, 10]);
  });

  it("tells Apple until when it is worth keeping, four weeks at most, or to try it once", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-19T08:00:00Z"));
    const apple = testApns();
    const phone = apple.device();
    const now = Date.parse("2026-10-19T08:00:00Z") / 1000;

    for (const seconds of [3600.7, 0, -5, 365 * 24 * 60 * 60]) {
      await apple.pusher.send(phone, push, seconds);
    }

    expect(apple.sent().map((sent) => sent.expiration)).toEqual([
      now + 3600,
      0,
      0,
      now + 28 * 24 * 60 * 60,
    ]);
  });

  it("is collapsed under its tag hashed with the phone's own secret, which says nothing of it", async () => {
    const apple = testApns();
    const [one, other] = [apple.device(), apple.device()];

    await apple.pusher.send(one, push, 60);
    await apple.pusher.send(one, push, 60);
    await apple.pusher.send(one, { ...push, tag: "another-tag" }, 60);
    await apple.pusher.send(other, push, 60);
    await apple.pusher.send(one, { ...push, tag: "" }, 60);

    const ids = apple.sent().map((sent) => sent.collapseId);
    // A newer word on the same thing takes the older one's place on the phone.
    expect(ids[1]).toBe(ids[0]);
    expect(ids[2]).not.toBe(ids[0]);
    // Another phone's is another: Apple cannot tell that two phones were told the same thing.
    expect(ids[3]).not.toBe(ids[0]);
    expect(ids[0]).toMatch(/^[\w-]{22}$/);
    expect(ids[0]).not.toContain("a-tag");
    // A push with no tag takes no other's place.
    expect(ids[4]).toBeNull();
  });

  it("holds a report's picture while it fits, and goes without it otherwise", async () => {
    const apple = testApns();
    const phone = apple.device();
    const image = `https://bucket.example.org/thumb.webp?${"s".repeat(400)}`;

    await apple.pusher.send(phone, { ...push, image }, 60);
    await apple.pusher.send(phone, { ...push, image, body: "b".repeat(2300) }, 60);

    const [whole, alone] = apple.sent();
    expect(whole?.push.image).toBe(image);
    expect(alone?.push).not.toHaveProperty("image");
    expect(alone?.push.body).toHaveLength(2300);
  });

  it("sends nothing that one push to an app cannot hold, nor to a token or an app it is not for", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const apple = testApns();
    const phone = apple.device();

    for (const [device, said] of [
      [phone, { ...push, body: "b".repeat(2900) }],
      [{ ...phone, token: "not-a-token" }, push],
      [{ ...phone, token: `${phone.token.toUpperCase()}` }, push],
      [{ ...phone, appId: "org.example.other" }, push],
      [{ ...phone, auth: "short" }, push],
    ] as const) {
      expect(await apple.pusher.send(device, said, 60)).toBe("refused");
    }
    expect(await apple.pusher.send(phone, push, Number.NaN)).toBe("refused");

    expect(apple.asked()).toEqual([]);
    expect(logged.mock.calls.map((call) => call.join(" "))).toEqual([
      "push: not taken (apns too long for one push)",
      "push: not taken (apns a token APNs did not give)",
      "push: not taken (apns a token APNs did not give)",
      "push: not taken (apns a device of another app)",
      "push: not taken (apns keys that are not a phone's)",
      "push: not taken (apns no time to keep it for)",
    ]);
  });

  it("says what became of it, by what Apple answered", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const apple = testApns();
    const phone = apple.device();
    const outcomes: Record<string, string[]> = {};

    for (const [status, reason] of [
      [200, ""],
      [410, "Unregistered"],
      [410, "ExpiredToken"],
      [400, "BadDeviceToken"],
      [400, "DeviceTokenNotForTopic"],
      [400, "BadCollapseId"],
      [400, "BadExpirationDate"],
      [403, "ExpiredProviderToken"],
      [403, "InvalidProviderToken"],
      [413, "PayloadTooLarge"],
      [429, "TooManyRequests"],
      [500, "InternalServerError"],
      [503, "ServiceUnavailable"],
    ] as const) {
      apple.answers.set(phone.token, { status, reason });
      (outcomes[await apple.pusher.send(phone, push, 60)] ??= []).push(`${status} ${reason}`);
    }
    apple.answers.set(phone.token, async () => ({ failure: "ECONNRESET" }));
    (outcomes[await apple.pusher.send(phone, push, 60)] ??= []).push("no answer");

    expect(outcomes).toEqual({
      taken: ["200 "],
      // The token is no more, or not this app's on the host its build said.
      gone: [
        "410 Unregistered",
        "410 ExpiredToken",
        "400 BadDeviceToken",
        "400 DeviceTokenNotForTopic",
      ],
      // It did not leave, a refusal of the instance's own token among them.
      refused: [
        "400 BadCollapseId",
        "400 BadExpirationDate",
        "403 ExpiredProviderToken",
        "403 InvalidProviderToken",
        "413 PayloadTooLarge",
        "429 TooManyRequests",
      ],
      // Apple failed, or did not answer: it may have taken it.
      failed: ["500 InternalServerError", "503 ServiceUnavailable", "no answer"],
    });
  });

  it("is gone when it goes to a host other than the one its build said", async () => {
    const apple = testApns();
    const phone = apple.device("development");

    expect(await apple.pusher.send({ ...phone, environment: "production" }, push, 60)).toBe("gone");
  });

  it("logs how it was not taken, by Apple's reason, and nothing of the token or of what it said", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const apple = testApns();
    const phone = apple.device();

    apple.answers.set(phone.token, { status: 403, reason: "InvalidProviderToken" });
    await apple.pusher.send(phone, push, 60);
    apple.answers.set(phone.token, { status: 500, reason: `${phone.token} broke` });
    await apple.pusher.send(phone, push, 60);
    apple.answers.set(phone.token, () => Promise.reject(new Error(`no way to ${phone.token}`)));
    await apple.pusher.send(phone, push, 60);
    // A token that is gone is how a phone's app ends: nothing failed.
    apple.answers.set(phone.token, { status: 410, reason: "Unregistered" });
    await apple.pusher.send(phone, push, 60);

    expect(logged.mock.calls.map((call) => call.join(" "))).toEqual([
      "push: not taken (apns InvalidProviderToken)",
      // A reason that is no word of Apple's is not repeated.
      "push: not taken (apns status 500)",
      "push: not taken (apns Error)",
    ]);
  });
});

describe("the token that names the instance to Apple", () => {
  const signedBy = (apple: ReturnType<typeof testApns>) =>
    apple
      .asked()
      .map((asked) =>
        readToken(asked.headers.authorization?.replace(/^bearer /, ""), apple.publicKey),
      );

  it("is signed by the team's key, for its key and its team, and when it was signed", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-19T08:00:00Z"));
    const apple = testApns();

    await apple.pusher.send(apple.device(), push, 60);

    expect(signedBy(apple)).toEqual([
      {
        header: { alg: "ES256", kid: apple.settings.APNS_KEY_ID },
        claims: {
          iss: apple.settings.APPLE_TEAM_ID,
          iat: Date.parse("2026-10-19T08:00:00Z") / 1000,
        },
        isSigned: true,
      },
    ]);
  });

  it("is used forty minutes, for both hosts, and signed anew then", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-19T08:00:00Z"));
    const apple = testApns();
    const [phone, developer] = [apple.device(), apple.device("development")];

    await apple.pusher.send(phone, push, 60);
    vi.setSystemTime(new Date("2026-10-19T08:39:59Z"));
    await apple.pusher.send(developer, push, 60);
    vi.setSystemTime(new Date("2026-10-19T08:40:00Z"));
    await apple.pusher.send(phone, push, 60);
    // A clock that was set back signs anew.
    vi.setSystemTime(new Date("2026-10-19T07:00:00Z"));
    await apple.pusher.send(phone, push, 60);

    const signed = signedBy(apple).map((one) => one?.claims.iat);
    expect(signed).toEqual(
      ["08:00:00", "08:00:00", "08:40:00", "07:00:00"].map(
        (at) => Date.parse(`2026-10-19T${at}Z`) / 1000,
      ),
    );
  });

  it("is signed anew when Apple says it is too old, unless one was signed in the last twenty minutes", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-19T08:00:00Z"));
    const apple = testApns();
    const phone = apple.device();
    const at = (time: string) => Date.parse(`2026-10-19T${time}Z`) / 1000;

    await apple.pusher.send(phone, push, 60);
    vi.setSystemTime(new Date("2026-10-19T08:25:00Z"));
    apple.answers.set(phone.token, { status: 403, reason: "ExpiredProviderToken" });
    expect(await apple.pusher.send(phone, push, 60)).toBe("refused");
    await apple.pusher.send(phone, push, 60);
    vi.setSystemTime(new Date("2026-10-19T08:30:00Z"));
    await apple.pusher.send(phone, push, 60);
    apple.answers.delete(phone.token);
    await apple.pusher.send(phone, push, 60);

    // Refused at 08:25 with the token of 08:00: one is signed then, and kept, as Apple would
    // refuse another so soon.
    expect(signedBy(apple).map((one) => one?.claims.iat)).toEqual([
      at("08:00:00"),
      at("08:00:00"),
      at("08:25:00"),
      at("08:25:00"),
      at("08:25:00"),
    ]);
  });
});

describe("a push to a server of this machine that speaks HTTP/2 as Apple does", () => {
  // A server that answers each stream as told, or not at all, and counts the sessions it was
  // given and the streams it saw cancelled.
  async function serving(answer: (stream: http2.ServerHttp2Stream, path: string) => void) {
    const server = http2.createServer();
    const asked: { path: string; headers: http2.IncomingHttpHeaders; body: Buffer }[] = [];
    const cancelled: (number | undefined)[] = [];
    const sessions = new Set<http2.ServerHttp2Session>();
    server.on("session", (session) => {
      sessions.add(session);
      session.on("error", () => {});
    });
    server.on("stream", (stream, headers) => {
      stream.on("error", () => {});
      stream.on("close", () => {
        if (stream.rstCode === http2.constants.NGHTTP2_CANCEL) cancelled.push(stream.id);
      });
      const chunks: Buffer[] = [];
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", () => {
        const path = String(headers[":path"]);
        asked.push({ path, headers, body: Buffer.concat(chunks) });
        answer(stream as http2.ServerHttp2Stream, path);
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as net.AddressInfo;
    const origin = `http://127.0.0.1:${port}`;
    return {
      origin,
      asked,
      cancelled,
      sessions: () => sessions.size,
      close: () =>
        new Promise<void>((resolve) => {
          for (const session of sessions) session.destroy();
          server.close(() => resolve());
        }),
    };
  }
  const local = (origin: string, sendMs?: number) => {
    const { settings } = testApns();
    const pusher = createApnsPusher(settings, {
      hosts: { production: origin, development: origin },
      ...(sendMs ? { sendMs } : {}),
    });
    if (!pusher) throw new Error("No pusher was made");
    return pusher;
  };
  const phone = () => ({
    token: "ab".repeat(32),
    appId: "org.example.app",
    environment: "production" as const,
    ...testReceiver().keys,
  });

  it("sends many pushes on one session, each on a stream of its own", async () => {
    const server = await serving((stream) => {
      stream.respond({ ":status": 200, "apns-id": "an-id" });
      stream.end();
    });
    const pusher = local(server.origin);
    const device = phone();

    expect(await pusher.send(device, push, 60)).toBe("taken");
    expect(
      await Promise.all([pusher.send(device, push, 60), pusher.send(device, push, 60)]),
    ).toEqual(["taken", "taken"]);

    expect(server.sessions()).toBe(1);
    expect(server.asked).toHaveLength(3);
    expect(server.asked[0]).toMatchObject({
      path: `/3/device/${device.token}`,
      headers: {
        ":method": "POST",
        "apns-push-type": "alert",
        "apns-topic": "org.example.app",
        "apns-priority": "10",
      },
    });
    expect(String(server.asked[0]?.headers.authorization)).toMatch(
      /^bearer [\w-]+\.[\w-]+\.[\w-]+$/,
    );
    expect(JSON.parse(server.asked[0]?.body.toString() ?? "")).toMatchObject({
      aps: { "mutable-content": 1 },
    });
    expect(server.cancelled).toEqual([]);
    pusher.close();
    await server.close();
  });

  it("reads the reason of a refusal", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const server = await serving((stream) => {
      stream.respond({ ":status": 400, "content-type": "application/json" });
      stream.end(JSON.stringify({ reason: "BadDeviceToken" }));
    });
    const pusher = local(server.origin);

    expect(await pusher.send(phone(), push, 60)).toBe("gone");

    pusher.close();
    await server.close();
  });

  it("cancels the stream of a push it gives up, in the time a push is given, and goes on with the session", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    // The first stream is never answered; the next ones are.
    const server = await serving((stream, path) => {
      if (server.asked.length === 1) return;
      stream.respond({ ":status": 200 });
      stream.end(path);
    });
    const pusher = local(server.origin, 150);
    const started = Date.now();

    expect(await pusher.send(phone(), push, 60)).toBe("failed");

    expect(Date.now() - started).toBeLessThan(1500);
    // Apple sees the stream end with RST_STREAM, and the session stay.
    await vi.waitFor(() => expect(server.cancelled).toHaveLength(1));
    expect(await pusher.send(phone(), push, 60)).toBe("taken");
    expect(server.sessions()).toBe(1);
    expect(logged.mock.calls.flat().join(" ")).toBe("push: not taken (apns no answer in time)");
    pusher.close();
    await server.close();
  });

  it("opens a session again when Apple closed the one it had", async () => {
    const server = await serving((stream) => {
      stream.respond({ ":status": 200 });
      stream.end();
      // Apple ends the session once it has answered.
      stream.session?.goaway();
    });
    const pusher = local(server.origin);

    expect(await pusher.send(phone(), push, 60)).toBe("taken");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await pusher.send(phone(), push, 60)).toBe("taken");

    expect(server.sessions()).toBe(2);
    pusher.close();
    await server.close();
  });

  it("fails in time at a host that takes the connection and never speaks HTTP/2", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const silent = net.createServer((socket) => {
      socket.on("error", () => {});
      socket.resume();
    });
    await new Promise<void>((resolve) => silent.listen(0, "127.0.0.1", resolve));
    const { port } = silent.address() as net.AddressInfo;
    const pusher = local(`http://127.0.0.1:${port}`, 150);
    const started = Date.now();

    expect(await pusher.send(phone(), push, 60)).toBe("failed");

    expect(Date.now() - started).toBeLessThan(1500);
    pusher.close();
    await new Promise<void>((resolve) => silent.close(() => resolve()));
  });

  it("fails when no server is there, by the kind the system names", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const server = await serving(() => {});
    const { origin } = server;
    await server.close();
    const pusher = local(origin);

    expect(await pusher.send(phone(), push, 60)).toBe("failed");

    expect(logged.mock.calls.flat().join(" ")).toMatch(/^push: not taken \(apns [A-Z0-9_]+\)$/);
    pusher.close();
  });
});
