import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { STAND_IN, collapseIdOf } from "./apps";
import { testReceiver } from "./testing";

// What the two ways out to the apps share: decision 072. That the line which stands in for a
// push is said in every language of the instance, its type holds.

describe("the line Apple shows in the place of a push the app could not open", () => {
  it("is the line the web app's service worker shows for a push it cannot read", () => {
    // The service worker imports nothing, and holds its own copy of the words.
    const worker = readFileSync(new URL("../../../apps/web/public/sw.js", import.meta.url), "utf8");

    for (const [locale, words] of Object.entries(STAND_IN)) {
      expect(worker, locale).toContain(`${locale}: ${JSON.stringify(words)}`);
    }
  });
});

describe("what a push to an iPhone is collapsed under", () => {
  it("is the same for one phone and one tag, and tells Apple nothing of the tag", () => {
    const { auth } = testReceiver().keys;
    const other = testReceiver().keys.auth;

    expect(collapseIdOf("report-a-break", auth)).toBe(collapseIdOf("report-a-break", auth));
    expect(collapseIdOf("report-a-break", auth)).not.toBe(collapseIdOf("report-b-break", auth));
    expect(collapseIdOf("report-a-break", auth)).not.toBe(collapseIdOf("report-a-break", other));
    // Apple takes 64 bytes at most.
    expect(collapseIdOf("report-a-break", auth)).toMatch(/^[\w-]{22}$/);
  });

  it("is not keyed with the phone's secret itself, which encrypts the push", () => {
    const { auth } = testReceiver().keys;
    const underSecret = createHmac("sha256", Buffer.from(auth, "base64url"))
      .update("report-a-break")
      .digest("base64url")
      .slice(0, 22);

    expect(collapseIdOf("report-a-break", auth)).not.toBe(underSecret);
  });

  it("is none for a push with no tag, or a phone whose secret is none", () => {
    expect(collapseIdOf("", testReceiver().keys.auth)).toBeNull();
    expect(collapseIdOf("a-tag", "short")).toBeNull();
  });
});
