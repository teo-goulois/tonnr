import { beforeEach, describe, expect, it } from "vitest";
import {
  readAnalyticsConsent,
  readErrorReports,
  setAnalyticsConsent,
  setErrorReports,
} from "./analytics-consent";
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
  it("sends error reports with the consent, until they are turned off alone", () => {
    expect(readErrorReports()).toBe(false);
    setAnalyticsConsent("granted");
    expect(readErrorReports()).toBe(true);
    setErrorReports(false);
    expect(readErrorReports()).toBe(false);
    expect(readAnalyticsConsent()).toBe("granted");
    expect(localStorage.getItem("error-reports")).toBe("off");
    setAnalyticsConsent("denied");
    setErrorReports(true);
    expect(readErrorReports()).toBe(false);
    // Accepting answers the one question again, which names the error reports.
    setErrorReports(false);
    setAnalyticsConsent("granted");
    expect(readErrorReports()).toBe(true);
  });
});
