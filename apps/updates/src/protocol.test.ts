import { describe, expect, it } from "vitest";

import { NO_UPDATE_KEY, latestKey, signedKey } from "./bucket.ts";
import { type Asked, type Store, answer, answerOf, multipartOf, readAsked } from "./protocol.ts";
import { partName, readMultipart, signatureOf } from "./testing.ts";

const RUNTIME = "0123456789abcdef0123456789abcdef01234567";
const UPDATE = "8b0f0f7e-4f2e-4c47-9b51-6a1e3c2d1f00";
const EMBEDDED = "1d6a2c4e-0b9e-4f0a-8a8d-3e5b7c9d1e2f";

const headersOf = (values: Record<string, string>) => new Headers(values);
const asking = (values: Record<string, string> = {}) =>
  headersOf({
    "expo-platform": "ios",
    "expo-protocol-version": "1",
    "expo-runtime-version": RUNTIME,
    ...values,
  });

describe("what an app asks", () => {
  it("is its platform, its runtime and the updates it runs and shipped with", () => {
    expect(
      readAsked(
        asking({
          "expo-current-update-id": UPDATE.toUpperCase(),
          "expo-embedded-update-id": EMBEDDED,
        }),
      ),
    ).toEqual({
      platform: "ios",
      runtime: RUNTIME,
      currentUpdateId: UPDATE,
      embeddedUpdateId: EMBEDDED,
    });
  });

  it("reads an id that is no update's as none", () => {
    expect(readAsked(asking({ "expo-current-update-id": "null" }))).toMatchObject({
      currentUpdateId: null,
      embeddedUpdateId: null,
    });
  });

  it("is refused with 400 for a platform other than ios or android", () => {
    expect(readAsked(asking({ "expo-platform": "web" }))).toMatchObject({ status: 400 });
    const headers = asking();
    headers.delete("expo-platform");
    expect(readAsked(headers)).toMatchObject({ status: 400 });
  });

  it("is refused with 406 for a protocol other than 1", () => {
    expect(readAsked(asking({ "expo-protocol-version": "0" }))).toMatchObject({ status: 406 });
    const headers = asking();
    headers.delete("expo-protocol-version");
    expect(readAsked(headers)).toMatchObject({ status: 406 });
  });

  it("is refused with 400 for a runtime that could not name a key of the bucket", () => {
    expect(readAsked(asking({ "expo-runtime-version": "../latest" }))).toMatchObject({
      status: 400,
    });
  });
});

/** A store of objects given by key, each with its signature. */
const storeOf = (objects: Record<string, { body: string; signature?: string }>): Store => ({
  async get(key) {
    const object = objects[key];
    if (!object) return null;
    return { body: new TextEncoder().encode(object.body), signature: object.signature ?? null };
  },
});

const ASKED: Asked = {
  platform: "ios",
  runtime: RUNTIME,
  currentUpdateId: EMBEDDED,
  embeddedUpdateId: EMBEDDED,
};
const NO_UPDATE = { body: '{"type":"noUpdateAvailable"}', signature: 'sig="no", keyid="main"' };
const MANIFEST = { body: `{"id":"${UPDATE}"}`, signature: 'sig="manifest", keyid="main"' };
const ROLLBACK = { body: '{"type":"rollBackToEmbedded"}', signature: 'sig="back", keyid="main"' };
const decoded = (answer: Awaited<ReturnType<typeof answerOf>>) =>
  answer.part === null
    ? null
    : { part: answer.part, body: new TextDecoder().decode(answer.signed.body) };

describe("which part of a publication an app gets", () => {
  it("is nothing new when nothing was published for its runtime", async () => {
    expect(decoded(await answerOf(ASKED, storeOf({ [NO_UPDATE_KEY]: NO_UPDATE })))).toEqual({
      part: "directive",
      body: NO_UPDATE.body,
    });
  });

  it("is a 204 before the directive that says nothing is new was ever signed", async () => {
    expect(await answerOf(ASKED, storeOf({}))).toEqual({ part: null });
  });

  it("is the manifest of the latest update, with its signature", async () => {
    const answer = await answerOf(
      ASKED,
      storeOf({
        [NO_UPDATE_KEY]: NO_UPDATE,
        [latestKey("ios", RUNTIME)]: { body: `{"kind":"update","id":"${UPDATE}"}` },
        [signedKey("ios", RUNTIME, UPDATE)]: MANIFEST,
      }),
    );
    expect(decoded(answer)).toEqual({ part: "manifest", body: MANIFEST.body });
    expect(answer.part !== null && answer.signed.signature).toBe(MANIFEST.signature);
  });

  it("is nothing new for an app that runs the latest update", async () => {
    const answer = await answerOf(
      { ...ASKED, currentUpdateId: UPDATE },
      storeOf({
        [NO_UPDATE_KEY]: NO_UPDATE,
        [latestKey("ios", RUNTIME)]: { body: `{"kind":"update","id":"${UPDATE}"}` },
        [signedKey("ios", RUNTIME, UPDATE)]: MANIFEST,
      }),
    );
    expect(decoded(answer)).toEqual({ part: "directive", body: NO_UPDATE.body });
  });

  it("sends an app back to its binary's JavaScript, unless it runs it already", async () => {
    const objects = {
      [NO_UPDATE_KEY]: NO_UPDATE,
      [latestKey("ios", RUNTIME)]: { body: `{"kind":"rollBackToEmbedded","id":"${UPDATE}"}` },
      [signedKey("ios", RUNTIME, UPDATE)]: ROLLBACK,
    };
    const running = { ...ASKED, currentUpdateId: "2c3d4e5f-0000-4000-8000-000000000000" };
    expect(decoded(await answerOf(running, storeOf(objects)))).toEqual({
      part: "directive",
      body: ROLLBACK.body,
    });
    expect(decoded(await answerOf(ASKED, storeOf(objects)))).toEqual({
      part: "directive",
      body: NO_UPDATE.body,
    });
  });

  it("is the runtime's own, on its own platform", async () => {
    const objects = {
      [NO_UPDATE_KEY]: NO_UPDATE,
      [latestKey("android", RUNTIME)]: { body: `{"kind":"update","id":"${UPDATE}"}` },
      [signedKey("android", RUNTIME, UPDATE)]: MANIFEST,
    };
    expect(decoded(await answerOf(ASKED, storeOf(objects)))?.body).toBe(NO_UPDATE.body);
    expect(decoded(await answerOf({ ...ASKED, platform: "android" }, storeOf(objects)))?.part).toBe(
      "manifest",
    );
  });

  it("reads a pointer it cannot read as nothing published", async () => {
    const objects = { [NO_UPDATE_KEY]: NO_UPDATE, [latestKey("ios", RUNTIME)]: { body: "{" } };
    expect(decoded(await answerOf(ASKED, storeOf(objects)))?.body).toBe(NO_UPDATE.body);
  });

  it("fails on a publication whose signed object is missing", async () => {
    const objects = {
      [latestKey("ios", RUNTIME)]: { body: `{"kind":"update","id":"${UPDATE}"}` },
      [signedKey("ios", RUNTIME, UPDATE)]: { body: MANIFEST.body },
    };
    await expect(answerOf(ASKED, storeOf(objects))).rejects.toThrow();
  });
});

describe("the multipart answer", () => {
  it("holds one part, its name, its signature and the bytes that were signed", () => {
    const body = new TextEncoder().encode('{"name":"Plage — été"}');
    const bytes = multipartOf("manifest", { body, signature: 'sig="abc", keyid="main"' }, "b-1");
    const [part, ...rest] = readMultipart(bytes, "multipart/mixed; boundary=b-1");
    expect(rest).toEqual([]);
    expect(part && partName(part)).toBe("manifest");
    expect(part && signatureOf(part)).toEqual({ sig: "abc", keyid: "main" });
    expect(part?.headers["content-type"]).toBe("application/json; charset=utf-8");
    expect(part && Buffer.from(part.body).equals(Buffer.from(body))).toBe(true);
  });
});

describe("the Worker's answer", () => {
  const request = (headers: Headers, init: RequestInit = {}, path = "/") =>
    new Request(`https://updates.example.org${path}`, { headers, ...init });

  it("says the protocol and keeps no copy, whatever it answers", async () => {
    const response = await answer(request(asking()), storeOf({ [NO_UPDATE_KEY]: NO_UPDATE }));
    expect(response.status).toBe(200);
    expect(response.headers.get("expo-protocol-version")).toBe("1");
    expect(response.headers.get("expo-sfv-version")).toBe("0");
    expect(response.headers.get("cache-control")).toBe("private, max-age=0");
    expect(response.headers.get("content-type")).toMatch(/^multipart\/mixed; boundary=/);

    const empty = await answer(request(asking()), storeOf({}));
    expect(empty.status).toBe(204);
    expect(empty.headers.get("expo-protocol-version")).toBe("1");
    expect(empty.headers.get("cache-control")).toBe("private, max-age=0");
  });

  it("refuses an unknown platform with 400 and another protocol with 406", async () => {
    const store = storeOf({});
    expect((await answer(request(asking({ "expo-platform": "web" })), store)).status).toBe(400);
    expect((await answer(request(asking({ "expo-protocol-version": "0" })), store)).status).toBe(
      406,
    );
  });

  it("answers at its root, to a GET alone", async () => {
    const store = storeOf({});
    expect((await answer(request(asking(), {}, "/latest"), store)).status).toBe(404);
    expect((await answer(request(asking(), { method: "POST" }), store)).status).toBe(405);
  });

  it("says it cannot answer when its bucket fails", async () => {
    const failing: Store = { get: () => Promise.reject(new Error("R2 is down")) };
    const response = await answer(request(asking()), failing);
    expect(response.status).toBe(503);
  });
});
