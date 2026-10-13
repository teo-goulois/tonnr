import { beforeEach, describe, expect, it } from "vitest";
import { readAnalyticsConsent, setAnalyticsConsent } from "./analytics-consent";
beforeEach(() => {
  localStorage.clear();
  setAnalyticsConsent(null);
});
describe("analytics consent", () => {
  it("starts unset, remembers refusal and can withdraw permission", () => {
    expect(readAnalyticsConsent()).toBeNull();
    setAnalyticsConsent("denied");
    expect(readAnalyticsConsent()).toBe("denied");
    setAnalyticsConsent("granted");
    expect(readAnalyticsConsent()).toBe("granted");
    setAnalyticsConsent("denied");
    expect(readAnalyticsConsent()).toBe("denied");
  });
  it("does not accept an old or malformed stored choice", () => {
    localStorage.setItem("analytics-consent", JSON.stringify({ choice: "granted", at: 0 }));
    expect(readAnalyticsConsent()).toBeNull();
    localStorage.setItem("analytics-consent", "malformed");
    expect(readAnalyticsConsent()).toBeNull();
  });
});
