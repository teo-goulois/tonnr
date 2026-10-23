import { describe, expect, it } from "vitest";

import { screenFeatureOf } from "./analytics-screen";

describe("the screen the app says it shows", () => {
  it("says the map, the tabs and the steps of the account as the web says its panels", () => {
    expect(screenFeatureOf("/", {})).toBe("map:conditions:");
    expect(screenFeatureOf("/saved", {})).toBe("saved:conditions:");
    expect(screenFeatureOf("/saved/shared/private-token", { token: "private-token" })).toBe(
      "saved:conditions:",
    );
    expect(screenFeatureOf("/alerts", {})).toBe("alerts:conditions:");
    expect(screenFeatureOf("/account", {})).toBe("account:conditions:");
    expect(screenFeatureOf("/account/friends", {})).toBe("friends:conditions:");
    expect(screenFeatureOf("/account/logbook", {})).toBe("sessions:conditions:");
    expect(screenFeatureOf("/account/profile", {})).toBe("account:conditions:");
  });

  it("says the kind of a place and its tab, and never its id", () => {
    expect(screenFeatureOf("/place/break/42", { tab: "guide" })).toBe("map:guide:break");
    expect(screenFeatureOf("/place/spot/7", {})).toBe("map:conditions:spot");
    expect(screenFeatureOf("/place/station/9", { tab: "forecast" })).toBe("map:conditions:station");
  });

  it("says the sign-in, and nothing of a sheet over a screen", () => {
    expect(screenFeatureOf("/sign-in", {})).toBe("authentication:sign_in:");
    expect(screenFeatureOf("/alert/new", { place: "break:42" })).toBeNull();
    expect(screenFeatureOf("/place/save", {})).toBeNull();
    expect(screenFeatureOf("/consent", {})).toBeNull();
  });
});
