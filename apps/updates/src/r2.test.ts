import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { amzDateOf, r2Client, signedHeaders } from "./r2.ts";

// The examples of Amazon's documentation of Signature Version 4 for S3, "Signature calculations
// for the Authorization header: transferring payload in a single chunk".
const AWS = {
  accessKeyId: "AKIAIOSFODNN7EXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
};
const EMPTY = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const signatureOf = (headers: Record<string, string>) =>
  /Signature=([0-9a-f]{64})$/.exec(headers.authorization ?? "")?.[1];

describe("a request signed by Signature Version 4", () => {
  it("signs a GET of an object as Amazon's example does", () => {
    const headers = signedHeaders(
      {
        method: "GET",
        url: new URL("https://examplebucket.s3.amazonaws.com/test.txt"),
        headers: { Range: "bytes=0-9" },
        payloadHash: EMPTY,
        amzDate: "20130524T000000Z",
      },
      AWS,
      "us-east-1",
    );
    expect(headers.authorization).toContain(
      "Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request",
    );
    expect(headers.authorization).toContain(
      "SignedHeaders=host;range;x-amz-content-sha256;x-amz-date",
    );
    expect(signatureOf(headers)).toBe(
      "f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41",
    );
  });

  it("signs a query in the order of its names, as Amazon's example does", () => {
    const headers = signedHeaders(
      {
        method: "GET",
        url: new URL("https://examplebucket.s3.amazonaws.com/?max-keys=2&prefix=J"),
        headers: {},
        payloadHash: EMPTY,
        amzDate: "20130524T000000Z",
      },
      AWS,
      "us-east-1",
    );
    expect(signatureOf(headers)).toBe(
      "34b48302e7b5fa45bde8084f4b7868a86f0a534bc59db6670ed5711ef69dc6f7",
    );
  });

  it("writes the date as x-amz-date does", () => {
    expect(amzDateOf(new Date("2026-10-20T09:08:07.654Z"))).toBe("20261020T090807Z");
  });
});

describe("the bucket through R2's S3 API", () => {
  const access = {
    accountId: "0123456789abcdef0123456789abcdef",
    accessKeyId: "key",
    secretAccessKey: "secret",
    bucket: "tonnr-prod-updates",
  };

  /** A fetch that keeps what it was asked and answers from a map of objects. */
  function standIn(objects = new Map<string, Uint8Array>()) {
    const asked: { method: string; url: string; headers: Record<string, string> }[] = [];
    const fetcher = (async (url: URL, init: RequestInit) => {
      const headers = init.headers as Record<string, string>;
      asked.push({ method: init.method ?? "GET", url: url.toString(), headers });
      const key = url.pathname.slice(`/${access.bucket}/`.length);
      if (init.method === "PUT") {
        objects.set(key, init.body as Uint8Array);
        return new Response(null, { status: 200 });
      }
      const object = objects.get(key);
      if (!object) return new Response(null, { status: 404 });
      return new Response(init.method === "HEAD" ? null : object, { status: 200 });
    }) as unknown as typeof fetch;
    return { asked, objects, client: r2Client(access, fetcher, () => new Date(0)) };
  }

  it("writes an object at the account's address, with its type, its cache and its metadata", async () => {
    const { asked, objects, client } = standIn();
    const body = new TextEncoder().encode("{}");
    await client.put("updates/ios/abc/id.json", body, {
      contentType: "application/json",
      cacheControl: "no-cache",
      metadata: { signature: 'sig="abc", keyid="main"' },
    });
    expect(objects.get("updates/ios/abc/id.json")).toEqual(body);
    const [put] = asked;
    expect(put?.url).toBe(
      "https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com/tonnr-prod-updates/updates/ios/abc/id.json",
    );
    expect(put?.headers).toMatchObject({
      "content-type": "application/json",
      "cache-control": "no-cache",
      "x-amz-meta-signature": 'sig="abc", keyid="main"',
      "x-amz-content-sha256": createHash("sha256").update(body).digest("hex"),
      "x-amz-date": "19700101T000000Z",
    });
    expect(put?.headers.authorization).toContain("Credential=key/19700101/auto/s3/aws4_request");
    expect(put?.headers.host).toBeUndefined();
  });

  it("reads an object, and none where there is none", async () => {
    const { client } = standIn(new Map([["files/a", new Uint8Array([1, 2])]]));
    expect(await client.get("files/a")).toEqual(new Uint8Array([1, 2]));
    expect(await client.get("files/b")).toBeNull();
    expect(await client.has("files/a")).toBe(true);
    expect(await client.has("files/b")).toBe(false);
  });

  it("says what R2 answered when it refuses", async () => {
    const fetcher = (async () =>
      new Response("AccessDenied", { status: 403 })) as unknown as typeof fetch;
    const client = r2Client(access, fetcher);
    await expect(client.put("files/a", new Uint8Array(), { contentType: "x" })).rejects.toThrow(
      /403 AccessDenied/,
    );
  });
});
