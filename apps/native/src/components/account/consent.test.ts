import { describe, expect, it } from "vitest";

import { CONSENT_LIFETIME_MS, consentFrom, consentRecord, errorReportsOn } from "./consent";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("the choice about analytics, as the phone keeps it", () => {
  it("is none until the person says, so nothing is on by default", () => {
    expect(consentFrom(null, Date.now())).toBeNull();
  });

  it("is kept 180 days, then asked again", () => {
    const at = Date.UTC(2026, 9, 19);
    const kept = consentRecord("granted", at);
    expect(consentFrom(kept, at + 179 * DAY_MS)).toBe("granted");
    expect(consentFrom(kept, at + CONSENT_LIFETIME_MS)).toBeNull();
    expect(consentFrom(consentRecord("denied", at), at + DAY_MS)).toBe("denied");
  });

  it("reads nothing it does not know", () => {
    expect(consentFrom("granted", Date.now())).toBeNull();
    expect(consentFrom(JSON.stringify({ choice: "maybe", at: Date.now() }), Date.now())).toBeNull();
    expect(consentFrom("{", Date.now())).toBeNull();
  });

  it("sends error reports with the yes alone, unless they were turned off since", () => {
    expect(errorReportsOn("granted", null)).toBe(true);
    expect(errorReportsOn("granted", "off")).toBe(false);
    expect(errorReportsOn("denied", null)).toBe(false);
    expect(errorReportsOn(null, null)).toBe(false);
  });
});
