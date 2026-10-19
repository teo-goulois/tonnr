// @vitest-environment node
import { readFileSync } from "node:fs";

import { ENGLISH } from "@repo/client/testing";
import { describe, expect, it } from "vitest";

// packages/client reads no app's files, so its tests write with English messages of their own:
// they say what this app's English says, each input in its place.
const english = JSON.parse(
  readFileSync(new URL("../../messages/en.json", import.meta.url), "utf8"),
) as Record<string, unknown>;

describe("the English that packages/client is tested in", () => {
  it("is the one of this app's messages", () => {
    for (const [key, write] of Object.entries(ENGLISH)) {
      const message = english[key];
      expect(typeof message, key).toBe("string");
      const inputs = Object.fromEntries(
        [...(message as string).matchAll(/\{(\w+)\}/g)].map(([, name]) => [name, `<${name}>`]),
      );
      expect((write as (inputs: object) => string)(inputs), key).toBe(
        (message as string).replace(/\{(\w+)\}/g, "<$1>"),
      );
    }
  });
});
