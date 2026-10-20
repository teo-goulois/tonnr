import { describe, expect, it } from "vitest";

import {
  activityChanges,
  notificationOf,
  startTokenChanged,
  startTokenField,
} from "./activity-tokens";

const TOKEN = "a1".repeat(40);
const OTHER = "b2".repeat(40);

describe("the token that starts the iPhone's Live Activities, as the device says it", () => {
  it("is given while the app's switch and the system's are both on", () => {
    expect(startTokenField({ isOn: true, systemOn: true, token: TOKEN })).toEqual({
      activityStartToken: TOKEN,
    });
  });

  it("is taken back while either switch is off", () => {
    expect(startTokenField({ isOn: false, systemOn: true, token: TOKEN })).toEqual({
      activityStartToken: null,
    });
    expect(startTokenField({ isOn: true, systemOn: false, token: TOKEN })).toEqual({
      activityStartToken: null,
    });
  });

  it("is left out, which keeps what the API holds, while the phone cannot tell", () => {
    expect(startTokenField({ isOn: true, systemOn: undefined, token: TOKEN })).toEqual({});
    expect(startTokenField({ isOn: true, systemOn: true, token: undefined })).toEqual({});
  });

  it("is said again when iOS changes it, or a switch goes off, and not otherwise", () => {
    const on = { isOn: true, systemOn: true, token: TOKEN };
    expect(startTokenChanged(on, TOKEN)).toBe(false);
    expect(startTokenChanged({ ...on, token: OTHER }, TOKEN)).toBe(true);
    expect(startTokenChanged({ ...on, systemOn: false }, TOKEN)).toBe(true);
    expect(startTokenChanged({ ...on, isOn: false }, null)).toBe(false);
    expect(startTokenChanged({ ...on, token: undefined }, TOKEN)).toBe(false);
    expect(startTokenChanged(on, undefined)).toBe(true);
  });
});

describe("the activities of a window, as the API is told of them", () => {
  const notificationId = "6f1c0d4e-5f3a-4b7e-9a51-2a8f0e4c9d10";

  it("gives the token of an activity that runs, once, and again when iOS changes it", () => {
    const running = [{ id: "activity-1", notificationId, token: TOKEN }];
    expect(activityChanges({}, running).started).toEqual([
      { id: "activity-1", notificationId, token: TOKEN },
    ]);
    expect(activityChanges({ "activity-1": { notificationId, token: TOKEN } }, running)).toEqual({
      started: [],
      ended: [],
    });
    const changed = [{ id: "activity-1", notificationId, token: OTHER }];
    expect(
      activityChanges({ "activity-1": { notificationId, token: TOKEN } }, changed).started,
    ).toHaveLength(1);
  });

  it("waits for an activity's token, and passes over one that names no notification", () => {
    expect(activityChanges({}, [{ id: "a", notificationId, token: null }]).started).toEqual([]);
    expect(activityChanges({}, [{ id: "a", notificationId: null, token: TOKEN }]).started).toEqual(
      [],
    );
  });

  it("says that an activity it gave ended once it no longer runs", () => {
    expect(activityChanges({ "activity-1": { notificationId, token: TOKEN } }, [])).toEqual({
      started: [],
      ended: [{ id: "activity-1", notificationId }],
    });
  });

  it("reads the notification an activity is of from the properties the worker wrote", () => {
    expect(notificationOf(JSON.stringify({ notificationId, alertId: "x" }))).toBe(notificationId);
    expect(notificationOf(null)).toBeNull();
    expect(notificationOf("{")).toBeNull();
    expect(notificationOf(JSON.stringify({ alertId: "x" }))).toBeNull();
  });
});
