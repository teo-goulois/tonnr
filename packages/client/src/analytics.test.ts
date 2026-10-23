import { describe, expect, it } from "vitest";

import { activeDayKey, featureOf, safeEvent, shouldReport, utcDay } from "./analytics";

describe("what an app sends of its analytics", () => {
  it("sends its three events alone, with the allowed properties and no person's", () => {
    const event = safeEvent({
      event: "$identify",
      properties: {
        distinct_id: "opaque",
        $anon_distinct_id: "0192b1c4-7c3e-7a1b-9f00-2d4b6c8e1f00",
        $set: { email: "private@example.org" },
        $app_name: "private",
        $device_name: "Maëlle's iPhone",
        $locale: "fr-FR",
        $screen_name: "/place/break/42",
      },
      $set: { email: "private@example.org" },
    });
    expect(event).toEqual({
      event: "$identify",
      properties: {
        distinct_id: "opaque",
        $anon_distinct_id: "0192b1c4-7c3e-7a1b-9f00-2d4b6c8e1f00",
        $ip: null,
        $geoip_disable: true,
      },
    });
    expect(safeEvent({ event: "Application Opened", properties: {} })).toBeNull();
    expect(safeEvent({ event: "$screen", properties: { $screen_name: "x" } })).toBeNull();
    expect(safeEvent(null)).toBeNull();
  });

  it("gives an error report the screen it happened on, and reads an event with no properties", () => {
    const event = safeEvent(
      { event: "$exception" },
      { feature: "map", tab: "conditions", place_kind: "break" },
    );
    expect(event?.properties).toEqual({
      $exception_list: [],
      feature: "map",
      tab: "conditions",
      place_kind: "break",
      $ip: null,
      $geoip_disable: true,
    });
  });
});

describe("which errors are reported", () => {
  it("reports a fault once, and twenty at most", () => {
    const reported = new Set<string>();
    expect(shouldReport(new TypeError("broke"), reported)).toBe(true);
    expect(shouldReport(new TypeError("broke"), reported)).toBe(false);
    for (let at = 0; at < 30; at++) shouldReport(new Error(`fault ${at}`), reported);
    expect(reported.size).toBe(20);
    expect(shouldReport(new Error("one more"), reported)).toBe(false);
  });

  it("leaves out a refusal of the API, an aborted request and what is no error", () => {
    const reported = new Set<string>();
    const refused = Object.assign(new Error("Not found"), { status: 404 });
    const fault = Object.assign(new Error("Internal"), { status: 500 });
    const aborted = new Error("Aborted");
    aborted.name = "AbortError";
    expect(shouldReport(refused, reported)).toBe(false);
    expect(shouldReport(aborted, reported)).toBe(false);
    expect(shouldReport("a string", reported)).toBe(false);
    expect(shouldReport(fault, reported)).toBe(true);
  });
});

describe("the day app_active is remembered for", () => {
  it("is the day in UTC, under the environment and the id", () => {
    expect(utcDay(Date.UTC(2026, 9, 22, 23, 59))).toBe("2026-10-22");
    expect(utcDay(Date.UTC(2026, 9, 23, 0, 0))).toBe("2026-10-23");
    expect(activeDayKey("production", "abc")).toBe("analytics-active:production:abc");
  });
});

describe("the screen's categories", () => {
  it("says the panel, the step, the tab and the kind of place in fixed words", () => {
    expect(featureOf({})).toBe("map:conditions:");
    expect(featureOf({ break: "42", tab: "guide" })).toBe("map:guide:break");
    expect(featureOf({ station: "7", tab: "reports" })).toBe("map:conditions:station");
    expect(featureOf({ panel: "account", settings: "friends" })).toBe("friends:conditions:");
    expect(featureOf({ panel: "account", settings: "profile" })).toBe("account:conditions:");
    expect(featureOf({ panel: "Pointe de la Torche" })).toBe("map:conditions:");
  });
});
