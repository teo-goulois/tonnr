import { describe, expect, it } from "vitest";

import { isNewRelease, releaseFile, servedRelease } from "./release";

const answers = (body: string, status = 200) =>
  (async () => new Response(body, { status })) as unknown as typeof fetch;

describe("the build a stage serves", () => {
  it("is read from the file the build wrote", async () => {
    expect(await servedRelease(answers(releaseFile("b2")))).toBe("b2");
  });

  it("is asked for past every cache", async () => {
    let asked: [unknown, RequestInit | undefined] | undefined;
    const read = (async (input: unknown, init?: RequestInit) => {
      asked = [input, init];
      return new Response(releaseFile("b2"));
    }) as unknown as typeof fetch;
    await servedRelease(read);
    expect(asked).toEqual(["/release.json", { cache: "no-store" }]);
  });

  it("is unknown when nothing said it", async () => {
    // A development server answers a page, a stage that is down a refusal.
    expect(await servedRelease(answers("<!doctype html>"))).toBeNull();
    expect(await servedRelease(answers(releaseFile("b2"), 503))).toBeNull();
    expect(await servedRelease(answers("{}"))).toBeNull();
    expect(await servedRelease(answers('{"release":""}'))).toBeNull();
    expect(await servedRelease(answers('{"release":3}'))).toBeNull();
    const offline = (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    expect(await servedRelease(offline)).toBeNull();
  });
});

describe("a new release", () => {
  it("is a build other than the one that runs", () => {
    expect(isNewRelease("b1", "b2")).toBe(true);
    expect(isNewRelease("b1", "b1")).toBe(false);
  });

  it("is never an unknown", () => {
    expect(isNewRelease("b1", null)).toBe(false);
    // A development server runs no build.
    expect(isNewRelease(undefined, "b2")).toBe(false);
  });
});
