import { describe, expect, it } from "vitest";

import { clientsOf, NO_CLIENTS } from "./clients";

describe("the builds of the apps for phones an instance answers", () => {
  it("answers every build while its settings name none", () => {
    expect(clientsOf({})).toEqual(NO_CLIENTS);
  });

  it("reads each platform apart", () => {
    expect(
      clientsOf({
        APP_IOS_OLDEST_BUILD: 1200,
        APP_IOS_NEWEST_BUILD: 1240,
        APP_IOS_STORE_URL: "https://apps.apple.com/app/id1234567890",
        APP_ANDROID_NEWEST_BUILD: 1238,
      }),
    ).toEqual({
      ios: {
        oldestBuild: 1200,
        newestBuild: 1240,
        storeUrl: "https://apps.apple.com/app/id1234567890",
      },
      android: { oldestBuild: null, newestBuild: 1238, storeUrl: null },
    });
    // The oldest may be the newest: every app older than the one in the store updates.
    expect(clientsOf({ APP_ANDROID_OLDEST_BUILD: 7, APP_ANDROID_NEWEST_BUILD: 7 }).android).toEqual(
      { oldestBuild: 7, newestBuild: 7, storeUrl: null },
    );
  });

  it("stops the API on a setting that cannot be right, and names it", () => {
    // Every app would be asked for a build that no store sells.
    expect(() => clientsOf({ APP_IOS_OLDEST_BUILD: 1300, APP_IOS_NEWEST_BUILD: 1240 })).toThrow(
      /APP_IOS_OLDEST_BUILD is above APP_IOS_NEWEST_BUILD/,
    );
    expect(() => clientsOf({ APP_ANDROID_OLDEST_BUILD: 0 })).toThrow(/APP_ANDROID_OLDEST_BUILD/);
    expect(() => clientsOf({ APP_IOS_NEWEST_BUILD: 12.5 })).toThrow(/APP_IOS_NEWEST_BUILD/);
    // An app opens the page it is given: a store's, over https, and nothing else.
    expect(() => clientsOf({ APP_ANDROID_STORE_URL: "market://details?id=app.tonnr" })).toThrow(
      /APP_ANDROID_STORE_URL/,
    );
    expect(() => clientsOf({ APP_IOS_STORE_URL: "apps.apple.com/app/id1" })).toThrow(
      /APP_IOS_STORE_URL/,
    );
  });
});
